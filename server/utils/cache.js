const { cacheRequests } = require("./metrics")
const NodeCache = require("node-cache")
const { getRedis } = require("../config/redis")
const logger = require("./logger")

// Response cache for read-heavy public endpoints (course catalog, categories).
//
// Backend: Redis when REDIS_URL is set (shared by every API instance), otherwise
// a process-local node-cache. Callers never see the difference.
//
// Design notes:
//  * Versioned keys. Every cached response key embeds a per-namespace version
//    (`cache:catalog:<version>:<url>`). Invalidation is a single INCR: the old
//    keys simply stop being read and expire on their own TTL. No SCAN/KEYS,
//    O(1) regardless of how many URLs are cached.
//  * TTL jitter (+-10%) so entries written together do not all expire together.
//  * Single-flight. On a miss the first request takes a short lock and computes;
//    concurrent requests for the same key wait for the result instead of all
//    hitting MongoDB at once (cache stampede / thundering herd).
//  * Fail-open. If Redis errors or is down, the request is served uncached.
const memory = new NodeCache({
  stdTTL: 60,
  useClones: false,
  // checkperiod is disabled in tests so its interval doesn't keep Jest alive.
  checkperiod: process.env.NODE_ENV === "test" ? 0 : 30,
})
const memoryVersions = new Map()
const memoryInflight = new Map()

const stats = { hits: 0, misses: 0, waits: 0, errors: 0 }
const CATALOG = "catalog"

const versionKey = (ns) => `cache:${ns}:ver`
const jitter = (ttl) => Math.max(1, Math.round(ttl * (0.9 + Math.random() * 0.2)))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function currentVersion(ns) {
  const redis = getRedis()
  if (redis) {
    try {
      return (await redis.get(versionKey(ns))) || "0"
    } catch (error) {
      stats.errors++
    }
  }
  return String(memoryVersions.get(ns) || 0)
}

async function storeGet(key) {
  const redis = getRedis()
  if (redis) {
    try {
      const raw = await redis.get(key)
      return raw === null ? undefined : JSON.parse(raw)
    } catch (error) {
      stats.errors++
    }
  }
  return memory.get(key)
}

async function storeSet(key, value, ttlSeconds) {
  const ttl = jitter(ttlSeconds)
  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttl)
      return
    } catch (error) {
      stats.errors++
    }
  }
  memory.set(key, value, ttl)
}

// Best-effort mutual exclusion for "who computes this key". Returns a release
// function, or null if someone else holds the lock.
async function acquireLock(key, ttlMs = 5000) {
  const redis = getRedis()
  if (redis) {
    try {
      const token = `${process.pid}:${Math.random()}`
      const ok = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX")
      if (!ok) return null
      // Release only our own lock (compare-and-delete), never one that expired
      // and was re-acquired by another request.
      return () =>
        redis
          .eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            `lock:${key}`,
            token
          )
          .catch(() => {})
    } catch (error) {
      stats.errors++
      return () => {}
    }
  }
  // Process-local single-flight.
  if (memoryInflight.has(key)) return null
  memoryInflight.set(key, true)
  const timer = setTimeout(() => memoryInflight.delete(key), ttlMs)
  timer.unref?.()
  return () => {
    clearTimeout(timer)
    memoryInflight.delete(key)
  }
}

// Polls for a value another request is computing; gives up after `maxMs`.
async function waitForValue(key, maxMs = 1500, stepMs = 40) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    await sleep(stepMs)
    const value = await storeGet(key)
    if (value !== undefined) return value
  }
  return undefined
}

// Express middleware caching a GET handler's successful JSON response.
function cacheResponse(ttlSeconds = 60, { namespace = CATALOG } = {}) {
  return async (req, res, next) => {
    if (req.method !== "GET") return next()

    let key
    try {
      key = `cache:${namespace}:${await currentVersion(namespace)}:${req.originalUrl}`
      const hit = await storeGet(key)
      if (hit !== undefined) {
        stats.hits++
        cacheRequests.inc({ namespace, result: "hit" })
        res.set("X-Cache", "HIT")
        return res.status(200).json(hit)
      }
    } catch (error) {
      logger.warn({ err: error.message }, "cache read failed; serving uncached")
      return next()
    }

    stats.misses++
    const release = await acquireLock(key)
    if (!release) {
      const filled = await waitForValue(key)
      if (filled !== undefined) {
        stats.waits++
        cacheRequests.inc({ namespace, result: "wait" })
        res.set("X-Cache", "HIT-WAIT")
        return res.status(200).json(filled)
      }
      // The computing request failed or is slow; fall through and compute.
    }

    cacheRequests.inc({ namespace, result: "miss" })
    res.set("X-Cache", "MISS")
    const originalJson = res.json.bind(res)
    let storing = false
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        storing = true
        storeSet(key, body, ttlSeconds)
          .catch(() => {})
          .finally(() => release && release())
      } else if (release) {
        release()
      }
      return originalJson(body)
    }
    // A handler that throws or never responds must not leave the lock held.
    // (When a value is being stored, the store step releases the lock itself so
    // waiters never see "unlocked but not yet cached".)
    res.on("close", () => !storing && release && release())
    return next()
  }
}

// Drops every cached catalog/category response. Called from each write path that
// changes what those endpoints return (publish, delete, restore, new review,
// category edits) so the TTL is only a safety net, not a window in which deleted
// or just-approved courses show the wrong state.
//
// The in-process version is bumped synchronously (callers do not await this),
// and the Redis INCR is pipelined ahead of any later read on the same connection.
function invalidateCatalogCache() {
  memoryVersions.set(CATALOG, (memoryVersions.get(CATALOG) || 0) + 1)
  const redis = getRedis()
  if (!redis) return Promise.resolve()
  return redis.incr(versionKey(CATALOG)).catch((error) => {
    stats.errors++
    logger.warn({ err: error.message }, "catalog cache invalidation failed")
  })
}

// Cache-aside helper for non-HTTP use: returns the cached value or computes,
// stores and returns it (with the same stampede protection).
async function getOrSet(namespace, name, ttlSeconds, loader) {
  const key = `cache:${namespace}:${await currentVersion(namespace)}:${name}`
  const cached = await storeGet(key)
  if (cached !== undefined) {
    stats.hits++
    return cached
  }
  stats.misses++
  const release = await acquireLock(key)
  if (!release) {
    const filled = await waitForValue(key)
    if (filled !== undefined) return filled
  }
  try {
    const value = await loader()
    await storeSet(key, value, ttlSeconds)
    return value
  } finally {
    if (release) release()
  }
}

module.exports = { cacheResponse, invalidateCatalogCache, getOrSet, cacheStats: stats }
