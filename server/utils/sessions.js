const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const RefreshToken = require("../models/RefreshToken")
const User = require("../models/User")
const { revokeToken } = require("./tokenRevocation")
const { recordAudit } = require("./audit")

// Sessions = a short-lived access token (JWT, sent as a Bearer header) plus a
// long-lived, rotating refresh token in an httpOnly cookie.
//
// - A stolen access token is only useful for ACCESS_TOKEN_TTL (15 min default).
// - The refresh token cannot be read by page scripts (httpOnly), is only sent to
//   /api/v1/auth, and changes on every use.
// - Presenting an already-used refresh token means two parties hold the same
//   token: the whole family is revoked and both must log in again.
const ACCESS_TTL = () => process.env.ACCESS_TOKEN_TTL || "15m"
const REFRESH_TTL_MS = () => Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7) * 24 * 3600 * 1000
const FAMILY_TTL_MS = () => Number(process.env.SESSION_MAX_DAYS || 30) * 24 * 3600 * 1000
// Two tabs refreshing at the same moment both present the same token; the
// second one inside this window is told to retry instead of being treated as theft.
const CONCURRENT_GRACE_MS = 10 * 1000

const COOKIE = "refreshToken"
const COOKIE_PATH = "/api/v1/auth"

class SessionError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

const hash = (raw) => crypto.createHash("sha256").update(raw).digest("hex")

function signAccessToken(user) {
  return jwt.sign(
    {
      email: user.email,
      id: String(user._id),
      accountType: user.accountType,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL(), jwtid: crypto.randomUUID() }
  )
}

async function issueRefreshToken(user, req, { family, familyExpiresAt } = {}) {
  const raw = crypto.randomBytes(32).toString("base64url")
  const now = Date.now()
  const familyEnd = familyExpiresAt || new Date(now + FAMILY_TTL_MS())
  await RefreshToken.create({
    user: user._id,
    family: family || crypto.randomUUID(),
    tokenHash: hash(raw),
    tokenVersion: user.tokenVersion || 0,
    expiresAt: new Date(Math.min(now + REFRESH_TTL_MS(), familyEnd.getTime())),
    familyExpiresAt: familyEnd,
    userAgent: String(req?.get?.("user-agent") || "").slice(0, 300),
    ip: req?.ip || "",
  })
  return raw
}

function cookieOptions() {
  const production = process.env.NODE_ENV === "production"
  return {
    httpOnly: true,
    // Frontend and API live on different sites in production (e.g. Vercel +
    // Render), which needs SameSite=None, and that requires Secure.
    secure: production,
    sameSite: production ? "none" : "lax",
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL_MS(),
  }
}

function setRefreshCookie(res, raw) {
  res.cookie(COOKIE, raw, cookieOptions())
}

function clearRefreshCookie(res) {
  const { maxAge, ...opts } = cookieOptions()
  res.clearCookie(COOKIE, opts)
}

const readRefreshCookie = (req) => req.cookies?.[COOKIE] || null

// Creates a new session for a user who has just proven who they are.
async function startSession(req, res, user) {
  const refreshToken = await issueRefreshToken(user, req)
  setRefreshCookie(res, refreshToken)
  return signAccessToken(user)
}

async function revokeFamily(family, reason) {
  await RefreshToken.updateMany(
    { family, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  )
}

async function revokeAllSessions(userId, reason) {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  )
}

// Exchanges a refresh token for a new access token and the next refresh token.
async function rotate(req, res) {
  const raw = readRefreshCookie(req)
  if (!raw) throw new SessionError(401, "No session", "missing")

  const now = new Date()
  const doc = await RefreshToken.findOne({ tokenHash: hash(raw) })
  if (!doc || doc.revokedAt || doc.expiresAt < now || doc.familyExpiresAt < now) {
    throw new SessionError(401, "Session expired. Please log in again.", "invalid")
  }

  // Claim the token atomically, so of two simultaneous requests exactly one wins.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: doc._id, usedAt: null, revokedAt: null },
    { $set: { usedAt: now } },
    { new: true }
  )
  if (!claimed) {
    const used = await RefreshToken.findById(doc._id)
    if (used?.usedAt && now - used.usedAt < CONCURRENT_GRACE_MS && !used.revokedAt) {
      throw new SessionError(409, "Session was just refreshed by another request", "concurrent")
    }
    // A used token came back: someone has a copy. End every session of this login.
    await revokeFamily(doc.family, "reuse_detected")
    await recordAudit(req, {
      action: "auth.refresh_reuse_detected",
      outcome: "failure",
      actor: { _id: doc.user },
      targetType: "session",
      targetId: doc.family,
    })
    throw new SessionError(401, "Session ended for your security. Please log in again.", "reuse")
  }

  const user = await User.findById(doc.user)
  if (!user || user.active === false || (user.tokenVersion || 0) !== doc.tokenVersion) {
    await revokeFamily(doc.family, "user_changed")
    throw new SessionError(401, "Session expired. Please log in again.", "invalid")
  }

  const next = await issueRefreshToken(user, req, { family: doc.family, familyExpiresAt: doc.familyExpiresAt })
  setRefreshCookie(res, next)
  return { user, accessToken: signAccessToken(user) }
}

// Ends the current session: the access token (by jti) and its refresh family.
async function endSession(req, res) {
  if (req.user) await revokeToken(req.user)
  const raw = readRefreshCookie(req)
  if (raw) {
    const doc = await RefreshToken.findOne({ tokenHash: hash(raw) })
    if (doc && (!req.user || String(doc.user) === String(req.user.id))) await revokeFamily(doc.family, "logout")
  }
  clearRefreshCookie(res)
}

// Active sessions (one per family) for the settings page.
async function listSessions(userId, currentRaw) {
  const now = new Date()
  const currentFamily = currentRaw ? (await RefreshToken.findOne({ tokenHash: hash(currentRaw) }))?.family : null
  const rows = await RefreshToken.find({ user: userId, revokedAt: null, usedAt: null, expiresAt: { $gt: now } })
    .sort({ createdAt: -1 })
    .lean()
  const families = await RefreshToken.aggregate([
    { $match: { user: rows[0]?.user || null, family: { $in: rows.map((r) => r.family) } } },
    { $group: { _id: "$family", startedAt: { $min: "$createdAt" } } },
  ])
  const started = new Map(families.map((f) => [f._id, f.startedAt]))
  return rows.map((r) => ({
    id: r.family,
    userAgent: r.userAgent,
    ip: r.ip,
    startedAt: started.get(r.family) || r.createdAt,
    lastActiveAt: r.createdAt,
    current: r.family === currentFamily,
  }))
}

module.exports = {
  SessionError,
  signAccessToken,
  startSession,
  rotate,
  endSession,
  revokeFamily,
  revokeAllSessions,
  listSessions,
  readRefreshCookie,
  clearRefreshCookie,
  COOKIE,
}
