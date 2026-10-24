const { getRedis } = require("../config/redis")

// Token-bucket rate limiter.
//
// A bucket holds up to `capacity` tokens and refills continuously at
// `refillPerSec`. Each request spends tokens; with none left it is rejected with
// a Retry-After. Unlike a fixed window it allows short bursts yet enforces the
// long-run rate, and it has no "reset at the top of the minute" cliff.
//
// The check-and-spend runs as one Lua script (atomic across instances) and uses
// Redis TIME, so differing server clocks cannot skew refills. Without Redis it
// falls back to the same algorithm in process memory.
const SCRIPT = `
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
tokens = math.min(capacity, tokens + ((now - ts) / 1000) * rate)
local allowed = 0
local retryMs = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retryMs = math.ceil(((cost - tokens) / rate) * 1000)
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil((capacity / rate) * 1000) + 1000)
return {allowed, math.floor(tokens), retryMs}
`

const buckets = new Map() // in-process fallback: key -> { tokens, ts }

function takeLocal(key, capacity, refillPerSec, cost) {
  const now = Date.now()
  const bucket = buckets.get(key) || { tokens: capacity, ts: now }
  bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.ts) / 1000) * refillPerSec)
  bucket.ts = now
  let allowed = false
  let retryMs = 0
  if (bucket.tokens >= cost) {
    bucket.tokens -= cost
    allowed = true
  } else {
    retryMs = Math.ceil(((cost - bucket.tokens) / refillPerSec) * 1000)
  }
  buckets.set(key, bucket)
  return { allowed, remaining: Math.floor(bucket.tokens), retryMs }
}

async function take(key, { capacity, refillPerSec, cost = 1 }) {
  const redis = getRedis()
  if (redis) {
    try {
      const [allowed, remaining, retryMs] = await redis.eval(SCRIPT, 1, `tb:${key}`, capacity, refillPerSec, cost)
      return { allowed: allowed === 1, remaining, retryMs }
    } catch (error) {
      /* fall through to the local bucket */
    }
  }
  return takeLocal(key, capacity, refillPerSec, cost)
}

// Express middleware. `keyFn(req)` picks the bucket (per user, per email, ...).
function tokenBucketLimiter({ name, capacity, refillPerSec, keyFn, message }) {
  return async (req, res, next) => {
    if (process.env.NODE_ENV === "test" && !process.env.RATE_LIMIT_IN_TESTS) return next()
    const subject = keyFn(req)
    if (!subject) return next()
    const result = await take(`${name}:${subject}`, { capacity, refillPerSec })
    res.set("X-RateLimit-Limit", String(capacity))
    res.set("X-RateLimit-Remaining", String(result.remaining))
    if (result.allowed) return next()
    res.set("Retry-After", String(Math.ceil(result.retryMs / 1000)))
    return res.status(429).json({
      success: false,
      message: message || "Too many requests. Please slow down and try again shortly.",
    })
  }
}

// Test helper.
function resetLocalBuckets() {
  buckets.clear()
}

module.exports = { take, tokenBucketLimiter, resetLocalBuckets }
