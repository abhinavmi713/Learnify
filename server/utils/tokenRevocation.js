const { getRedis } = require("../config/redis")
const logger = require("./logger")

// Server-side session revocation by JWT id (`jti`).
//
// JWTs are stateless, so logging out only deleted the token in the browser: a
// copied token stayed valid until it expired. On logout the token's jti goes on
// a denylist in Redis with a TTL equal to the token's remaining life, so the list
// cleans itself up. (A password change still invalidates all tokens at once via
// `tokenVersion`; this handles "log out this one session".)
//
// Failure policy: if Redis is down, the denylist cannot be consulted and the
// request is allowed (fail-open). Availability is preferred here because the
// other checks (signature, expiry, tokenVersion, active flag) still apply; the
// trade-off is that a revoked token works again until Redis is back.
const local = new Map() // jti -> expiry ms, used when Redis is not available

const keyFor = (jti) => `revoked:${jti}`

async function revokeToken(decoded) {
  if (!decoded?.jti) return false
  const ttl = Math.max(1, (decoded.exp || 0) - Math.floor(Date.now() / 1000))
  local.set(decoded.jti, Date.now() + ttl * 1000)
  const redis = getRedis()
  if (!redis) return true
  try {
    await redis.set(keyFor(decoded.jti), "1", "EX", ttl)
  } catch (error) {
    logger.warn({ err: error.message }, "could not store token revocation in redis")
  }
  return true
}

async function isRevoked(jti) {
  if (!jti) return false
  const until = local.get(jti)
  if (until) {
    if (until > Date.now()) return true
    local.delete(jti)
  }
  const redis = getRedis()
  if (!redis) return false
  try {
    return (await redis.exists(keyFor(jti))) === 1
  } catch (error) {
    return false // fail-open, see the note at the top
  }
}

function resetLocalRevocations() {
  local.clear()
}

module.exports = { revokeToken, isRevoked, resetLocalRevocations }
