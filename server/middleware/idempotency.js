const crypto = require("crypto")
const { getRedis } = require("../config/redis")
const logger = require("../utils/logger")

// Idempotency keys (the Stripe pattern) for requests that must not run twice:
// a double-clicked "Buy", a retried request after a timeout, a flaky network.
//
// The client sends `Idempotency-Key: <unique id per user action>`.
// - First request with a key: runs normally; its response is stored for 24 h.
// - Same key again: the stored response is replayed (header Idempotent-Replayed)
//   and the handler does not run.
// - Same key while the first is still running: 409, try again shortly.
// - Same key with a different body: 422, keys must not be reused for other work.
// - A 5xx response is not stored, so the client may retry with the same key.
//
// Keys are scoped per user and route. Stored in Redis (shared by all API
// instances); an in-process map is used when Redis is not configured.
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/
const LOCK_TTL_SEC = 60

const local = new Map() // key -> { value, expiresAt }

const store = {
  async claim(key, value, ttlSec) {
    const redis = getRedis()
    if (redis) return (await redis.set(key, value, "EX", ttlSec, "NX")) === "OK"
    const hit = local.get(key)
    if (hit && hit.expiresAt > Date.now()) return false
    local.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
    return true
  },
  async get(key) {
    const redis = getRedis()
    if (redis) return redis.get(key)
    const hit = local.get(key)
    return hit && hit.expiresAt > Date.now() ? hit.value : null
  },
  async set(key, value, ttlSec) {
    const redis = getRedis()
    if (redis) return redis.set(key, value, "EX", ttlSec)
    local.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
  },
  async del(key) {
    const redis = getRedis()
    if (redis) return redis.del(key)
    local.delete(key)
  },
}

const fingerprint = (body) => crypto.createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex")

function idempotent({ ttlSec = 24 * 3600, required = false } = {}) {
  const middleware = async (req, res, next) => {
    const key = req.get("Idempotency-Key")
    if (!key) {
      if (!required) return next()
      return res.status(400).json({ success: false, message: "Idempotency-Key header is required" })
    }
    if (!KEY_PATTERN.test(key)) {
      return res.status(400).json({ success: false, message: "Invalid Idempotency-Key" })
    }

    const scope = `idem:${req.user?.id || "anon"}:${req.method}:${req.baseUrl}${req.path}:${key}`
    const fp = fingerprint(req.body)

    let claimed
    try {
      claimed = await store.claim(scope, JSON.stringify({ state: "processing", fp }), LOCK_TTL_SEC)
    } catch (error) {
      // Without the store we cannot deduplicate; run the request rather than fail it.
      logger.warn({ err: error.message }, "idempotency store unavailable")
      return next()
    }

    if (!claimed) {
      const existing = JSON.parse((await store.get(scope)) || "null")
      if (!existing) return res.status(409).json({ success: false, message: "Request in progress, retry shortly" })
      if (existing.fp !== fp) {
        return res.status(422).json({ success: false, message: "Idempotency-Key was already used for a different request" })
      }
      if (existing.state === "processing") {
        res.set("Retry-After", "1")
        return res.status(409).json({ success: false, message: "This request is already being processed" })
      }
      res.set("Idempotent-Replayed", "true")
      return res.status(existing.status).json(existing.body)
    }

    // Capture what the handler sends so it can be replayed.
    let captured
    const originalJson = res.json.bind(res)
    res.json = (body) => {
      captured = body
      return originalJson(body)
    }

    res.on("finish", () => {
      const done =
        res.statusCode >= 500 || captured === undefined
          ? store.del(scope)
          : store.set(scope, JSON.stringify({ state: "done", fp, status: res.statusCode, body: captured }), ttlSec)
      Promise.resolve(done).catch((error) => logger.warn({ err: error.message }, "could not store idempotent response"))
    })
    next()
  }
  middleware.openapi = { idempotent: { required } }
  return middleware
}

function resetIdempotencyStore() {
  local.clear()
}

module.exports = { idempotent, resetIdempotencyStore }
