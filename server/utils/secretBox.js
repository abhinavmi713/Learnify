const crypto = require("crypto")

// Encrypts small secrets at rest (TOTP seeds) with AES-256-GCM. The key comes
// from ENCRYPTION_KEY (64 hex chars = 32 bytes) and is separate from JWT_SECRET,
// so rotating the signing secret does not lock everyone out of 2FA.
// Format: v1.<iv>.<tag>.<ciphertext>, all base64url.
function key() {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) return null
  return Buffer.from(hex, "hex")
}

const isConfigured = () => Boolean(key())

function seal(plaintext) {
  const k = key()
  if (!k) throw new Error("ENCRYPTION_KEY is not configured")
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv)
  const data = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (Buffer.isBuffer(p) ? p.toString("base64url") : p)).join(".")
}

function open(sealed) {
  const k = key()
  if (!k) throw new Error("ENCRYPTION_KEY is not configured")
  const [version, iv, tag, data] = String(sealed).split(".")
  if (version !== "v1") throw new Error("Unknown secret format")
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
}

module.exports = { seal, open, isConfigured }
