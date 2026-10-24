const Redis = require("ioredis")
const logger = require("../utils/logger")
const { registerCheck } = require("../utils/health")

// One shared Redis connection, created on first use. When REDIS_URL is unset the
// getter returns null and every caller falls back to an in-process equivalent,
// so `npm start` and the tests work without Docker.
let client // undefined = not resolved yet, null = disabled

function create() {
  const url = process.env.REDIS_URL
  if (!url) return null

  const redis = new Redis(url, {
    // Bound how long a request can wait on a dead Redis; callers treat the
    // resulting error as "unavailable" and degrade instead of hanging.
    commandTimeout: 800,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
  })

  // ioredis emits an error on every failed reconnect; log the first, then stay quiet.
  let reported = false
  redis.on("error", (error) => {
    if (reported) return
    reported = true
    logger.warn({ err: error.message }, "redis unavailable; falling back to in-process behaviour")
  })
  redis.on("ready", () => {
    if (reported) logger.info("redis connection restored")
    reported = false
  })

  registerCheck("redis", () => redis.ping(), { critical: false })
  return redis
}

// Returns a connected client, or null when Redis is disabled or not currently
// ready (so the caller degrades immediately instead of queueing commands).
function getRedis() {
  if (client === undefined) client = create()
  return client && client.status === "ready" ? client : null
}

// True when Redis is configured at all (even if momentarily down).
function redisConfigured() {
  if (client === undefined) client = create()
  return client !== null
}

// Raw client regardless of readiness (used for shutdown).
function rawRedis() {
  return client || null
}

async function closeRedis() {
  if (client) {
    await client.quit().catch(() => client.disconnect())
    client = undefined
  }
}

// Tests inject ioredis-mock here.
function setRedisForTests(mock) {
  client = mock === undefined ? undefined : mock
}

module.exports = { getRedis, redisConfigured, rawRedis, closeRedis, setRedisForTests }
