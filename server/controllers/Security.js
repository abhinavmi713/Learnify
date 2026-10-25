const crypto = require("crypto")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const QRCode = require("qrcode")
const User = require("../models/User")
const RefreshToken = require("../models/RefreshToken")
const totp = require("../utils/totp")
const secretBox = require("../utils/secretBox")
const { recordAudit } = require("../utils/audit")
const { rotate, revokeAllSessions, listSessions, readRefreshCookie, clearRefreshCookie, SessionError } = require("../utils/sessions")
const { revokeToken } = require("../utils/tokenRevocation")
const { completeLogin } = require("./Auth")

const RECOVERY_CODES = 8
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000

const hashCode = (code) => crypto.createHash("sha256").update(code.replace(/-/g, "").toLowerCase()).digest("hex")
const newRecoveryCode = () => {
  const raw = crypto.randomBytes(5).toString("hex") // 10 hex chars
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

// ---------------------------------------------------------------- sessions

// POST /auth/refresh: new access token for a valid refresh cookie (rotated).
exports.refresh = async (req, res) => {
  try {
    const { accessToken } = await rotate(req, res)
    return res.status(200).json({ success: true, token: accessToken })
  } catch (error) {
    if (error instanceof SessionError) {
      if (error.status === 401) clearRefreshCookie(res)
      return res.status(error.status).json({ success: false, message: error.message, code: error.code })
    }
    return res.status(500).json({ success: false, message: "Could not refresh session" })
  }
}

// GET /auth/sessions
exports.getSessions = async (req, res) => {
  const sessions = await listSessions(req.user.id, readRefreshCookie(req))
  return res.status(200).json({ success: true, data: sessions })
}

// POST /auth/sessions/revoke { sessionId }
exports.revokeSession = async (req, res) => {
  const { sessionId } = req.body
  const result = await RefreshToken.updateMany(
    { user: req.user.id, family: String(sessionId || ""), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "revoked_by_user" } }
  )
  if (!result.modifiedCount) return res.status(404).json({ success: false, message: "Session not found" })
  await recordAudit(req, { action: "auth.session_revoked", targetType: "session", targetId: sessionId })
  return res.status(200).json({ success: true, message: "Session signed out" })
}

// POST /auth/logout-all: ends every session, including access tokens already
// handed out (tokenVersion bump), e.g. after losing a device.
exports.logoutAll = async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } })
  await revokeAllSessions(req.user.id, "logout_all")
  await revokeToken(req.user)
  clearRefreshCookie(res)
  await recordAudit(req, { action: "auth.logout_all", targetType: "user", targetId: req.user.id })
  return res.status(200).json({ success: true, message: "Signed out everywhere" })
}

// ---------------------------------------------------------------- two-factor

const withSecrets = (id) => User.findById(id).select("+twoFactor")

// POST /auth/2fa/setup: new secret, kept pending until a code proves the app has it.
exports.setupTwoFactor = async (req, res) => {
  if (!secretBox.isConfigured()) {
    return res.status(503).json({ success: false, message: "Two-factor authentication is not available on this server" })
  }
  const user = await withSecrets(req.user.id)
  if (user.twoFactorEnabled) return res.status(400).json({ success: false, message: "Two-factor authentication is already on" })

  const secret = totp.generateSecret()
  user.twoFactor.pendingSecret = secretBox.seal(secret)
  await user.save()

  const otpauthUrl = totp.otpauthUrl({ secret, account: user.email })
  return res.status(200).json({
    success: true,
    data: { secret, otpauthUrl, qrCode: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) },
  })
}

// POST /auth/2fa/enable { code }: confirms the pending secret, returns recovery codes once.
exports.enableTwoFactor = async (req, res) => {
  const user = await withSecrets(req.user.id)
  if (!user.twoFactor?.pendingSecret) return res.status(400).json({ success: false, message: "Start the setup first" })

  const step = totp.verify(secretBox.open(user.twoFactor.pendingSecret), req.body.code)
  if (step === null) {
    await recordAudit(req, { action: "auth.2fa_enable", outcome: "failure" })
    return res.status(400).json({ success: false, message: "That code is not valid. Check your app and try again." })
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode)
  user.twoFactor.secret = user.twoFactor.pendingSecret
  user.twoFactor.pendingSecret = null
  user.twoFactor.lastUsedStep = step
  user.twoFactor.recoveryCodes = recoveryCodes.map(hashCode)
  user.twoFactor.enabledAt = new Date()
  user.twoFactorEnabled = true
  await user.save()
  await recordAudit(req, { action: "auth.2fa_enable" })
  return res.status(200).json({ success: true, message: "Two-factor authentication is on", data: { recoveryCodes } })
}

// Checks a TOTP code or a recovery code. Consumes what it accepts (records the
// step / removes the recovery code). Returns "totp" | "recovery" | null.
async function consumeSecondFactor(user, code) {
  const given = String(code || "").trim()
  if (/^\d{6}$/.test(given.replace(/\s/g, ""))) {
    const step = totp.verify(secretBox.open(user.twoFactor.secret), given, { afterStep: user.twoFactor.lastUsedStep || 0 })
    if (step === null) return null
    // Conditional update: two requests racing with the same code cannot both win.
    const won = await User.updateOne(
      { _id: user._id, "twoFactor.lastUsedStep": user.twoFactor.lastUsedStep || 0 },
      { $set: { "twoFactor.lastUsedStep": step } }
    )
    return won.modifiedCount ? "totp" : null
  }
  const hashed = hashCode(given)
  if (!user.twoFactor.recoveryCodes.includes(hashed)) return null
  const won = await User.updateOne({ _id: user._id, "twoFactor.recoveryCodes": hashed }, { $pull: { "twoFactor.recoveryCodes": hashed } })
  return won.modifiedCount ? "recovery" : null
}

// POST /auth/2fa/disable { password, code }
exports.disableTwoFactor = async (req, res) => {
  const user = await withSecrets(req.user.id)
  if (!user.twoFactorEnabled) return res.status(400).json({ success: false, message: "Two-factor authentication is not on" })
  const passwordOk = await bcrypt.compare(String(req.body.password || ""), user.password)
  const factor = passwordOk ? await consumeSecondFactor(user, req.body.code) : null
  if (!factor) {
    await recordAudit(req, { action: "auth.2fa_disable", outcome: "failure" })
    return res.status(400).json({ success: false, message: "Password or code is not valid" })
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { twoFactorEnabled: false, twoFactor: { secret: null, pendingSecret: null, lastUsedStep: 0, recoveryCodes: [], enabledAt: null } } }
  )
  await recordAudit(req, { action: "auth.2fa_disable" })
  return res.status(200).json({ success: true, message: "Two-factor authentication is off" })
}

// POST /auth/login/2fa { challenge, code }: second login step.
exports.loginTwoFactor = async (req, res) => {
  let claims
  try {
    claims = jwt.verify(String(req.body.challenge || ""), process.env.JWT_SECRET)
  } catch (error) {
    claims = null
  }
  if (!claims || claims.purpose !== "2fa") {
    return res.status(401).json({ success: false, message: "Your sign-in expired. Please enter your password again." })
  }

  const user = await withSecrets(claims.id).populate("additionalDetails")
  if (!user || user.active === false || !user.twoFactorEnabled || (user.tokenVersion || 0) !== claims.tokenVersion) {
    return res.status(401).json({ success: false, message: "Your sign-in expired. Please enter your password again." })
  }
  if (user.lockUntil && user.lockUntil > Date.now()) {
    return res.status(423).json({ success: false, message: "Too many failed attempts. Please try again later." })
  }

  const factor = await consumeSecondFactor(user, req.body.code)
  if (!factor) {
    // Wrong codes count towards the same lockout as wrong passwords.
    const attempts = (user.failedLoginAttempts || 0) + 1
    const update = attempts >= MAX_FAILED_ATTEMPTS ? { failedLoginAttempts: 0, lockUntil: Date.now() + LOCK_DURATION_MS } : { failedLoginAttempts: attempts }
    await User.updateOne({ _id: user._id }, update)
    await recordAudit(req, { action: "auth.login_2fa", outcome: "failure", actor: user, metadata: { locked: Boolean(update.lockUntil) } })
    return res.status(401).json({ success: false, message: "That code is not valid" })
  }

  await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0 }, $unset: { lockUntil: "" } })
  if (factor === "recovery") await recordAudit(req, { action: "auth.recovery_code_used", actor: user })
  return completeLogin(req, res, user)
}

exports.hashRecoveryCode = hashCode
