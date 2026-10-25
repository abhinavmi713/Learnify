const crypto = require("crypto")

// Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 s steps),
// compatible with Google Authenticator, Authy, 1Password and similar apps.
const STEP_SECONDS = 30
const DIGITS = 6
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$|\s/g, "")
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error("Invalid base32 character")
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

const generateSecret = () => base32Encode(crypto.randomBytes(20))

const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS)

// HOTP (RFC 4226) for one counter value.
function codeForStep(secret, step) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0")
}

// Accepts the current step and one either side (clock drift). Returns the step
// that matched, or null. A step at or before `afterStep` is refused, so a code
// that was already used cannot be replayed within its window.
function verify(secret, code, { now = Date.now(), window = 1, afterStep = 0 } = {}) {
  const given = String(code || "").replace(/\s/g, "")
  if (!/^\d{6}$/.test(given)) return null
  const current = stepAt(now)
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta
    if (step <= afterStep) continue
    const expected = codeForStep(secret, step)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return step
  }
  return null
}

function otpauthUrl({ secret, account, issuer = "Learnify" }) {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) })
  return `otpauth://totp/${label}?${params}`
}

module.exports = { generateSecret, verify, codeForStep, stepAt, otpauthUrl, base32Encode, base32Decode }
