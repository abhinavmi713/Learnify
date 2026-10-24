const express = require("express")
const request = require("supertest")
const RedisMock = require("ioredis-mock")
const jwt = require("jsonwebtoken")

const app = require("../app")
const { setRedisForTests } = require("../config/redis")
const { cacheResponse, invalidateCatalogCache, cacheStats } = require("../utils/cache")
const { take, tokenBucketLimiter, resetLocalBuckets } = require("../utils/tokenBucket")
const { revokeToken, isRevoked, resetLocalRevocations } = require("../utils/tokenRevocation")
const { RedisRateStore } = require("../utils/redisRateStore")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser } = require("./helpers")

let redis

beforeAll(async () => {
  await startTestDb()
}, 120000)
afterAll(async () => {
  await stopTestDb()
})
beforeEach(async () => {
  redis = new RedisMock()
  redis.status = "ready" // the mock does not model connection state
  await redis.flushall()
  setRedisForTests(redis)
  resetLocalBuckets()
  resetLocalRevocations()
})
afterEach(async () => {
  setRedisForTests(undefined)
  await clearTestDb()
})

// A tiny app whose handler we can count calls to.
function makeCachedApp({ delayMs = 0 } = {}) {
  const calls = { n: 0 }
  const a = express()
  a.get("/course/getAllCourses", cacheResponse(30), async (req, res) => {
    calls.n++
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    res.json({ success: true, n: calls.n })
  })
  a.get("/boom", cacheResponse(30), (req, res) => res.status(500).json({ success: false }))
  return { a, calls }
}

describe("redis response cache", () => {
  test("second request is a HIT and does not run the handler again", async () => {
    const { a, calls } = makeCachedApp()
    const first = await request(a).get("/course/getAllCourses?x=1")
    const second = await request(a).get("/course/getAllCourses?x=1")
    expect(first.headers["x-cache"]).toBe("MISS")
    expect(second.headers["x-cache"]).toBe("HIT")
    expect(second.body.n).toBe(1)
    expect(calls.n).toBe(1)
    // The entry really lives in Redis (shared across instances), not just memory.
    const keys = await redis.keys("cache:catalog:*")
    expect(keys.length).toBeGreaterThan(0)
  })

  test("different query strings are cached separately", async () => {
    const { a, calls } = makeCachedApp()
    await request(a).get("/course/getAllCourses?page=1")
    await request(a).get("/course/getAllCourses?page=2")
    expect(calls.n).toBe(2)
  })

  test("invalidation is one version bump and the next request recomputes", async () => {
    const { a, calls } = makeCachedApp()
    await request(a).get("/course/getAllCourses")
    await invalidateCatalogCache()
    expect(await redis.get("cache:catalog:ver")).toBe("1")
    const after = await request(a).get("/course/getAllCourses")
    expect(after.headers["x-cache"]).toBe("MISS")
    expect(calls.n).toBe(2)
  })

  test("errors are never cached", async () => {
    const { a } = makeCachedApp()
    await request(a).get("/boom")
    const again = await request(a).get("/boom")
    expect(again.headers["x-cache"]).toBe("MISS")
  })

  test("stampede protection: concurrent misses compute once", async () => {
    const { a, calls } = makeCachedApp({ delayMs: 150 })
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => request(a).get("/course/getAllCourses?stampede=1"))
    )
    expect(responses.every((r) => r.status === 200)).toBe(true)
    expect(calls.n).toBe(1)
    expect(cacheStats.waits).toBeGreaterThan(0)
  })

  test("still works (in memory) when Redis is unavailable", async () => {
    setRedisForTests(null)
    const { a, calls } = makeCachedApp()
    await request(a).get("/course/getAllCourses")
    const second = await request(a).get("/course/getAllCourses")
    expect(second.headers["x-cache"]).toBe("HIT")
    expect(calls.n).toBe(1)
  })
})

describe("token bucket", () => {
  // Slow refill so a few ms between calls cannot hand back a whole token.
  const opts = { capacity: 3, refillPerSec: 0.5 }

  test.each([
    ["redis", () => setRedisForTests(redis)],
    ["in-memory fallback", () => setRedisForTests(null)],
  ])("allows a burst up to capacity, then rejects with a retry hint (%s)", async (_label, use) => {
    use()
    const results = []
    for (let i = 0; i < 4; i++) results.push(await take("k1", opts))
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false])
    expect(results[3].retryMs).toBeGreaterThan(0)
  })

  test("refills over time (deterministic clock, in-memory algorithm)", async () => {
    setRedisForTests(null)
    let now = 1_000_000
    const clock = jest.spyOn(Date, "now").mockImplementation(() => now)
    try {
      const cfg = { capacity: 3, refillPerSec: 2 }
      for (let i = 0; i < 3; i++) expect((await take("k2", cfg)).allowed).toBe(true)
      const denied = await take("k2", cfg)
      expect(denied.allowed).toBe(false)
      expect(denied.retryMs).toBe(500) // one token at 2 tokens/sec
      now += 499
      expect((await take("k2", cfg)).allowed).toBe(false)
      now += 2
      expect((await take("k2", cfg)).allowed).toBe(true)
    } finally {
      clock.mockRestore()
    }
  })

  test("buckets are independent per key", async () => {
    for (let i = 0; i < 3; i++) await take("alice", opts)
    expect((await take("alice", opts)).allowed).toBe(false)
    expect((await take("bob", opts)).allowed).toBe(true)
  })

  test("middleware answers 429 with Retry-After", async () => {
    process.env.RATE_LIMIT_IN_TESTS = "1"
    try {
      const a = express()
      a.use(tokenBucketLimiter({ name: "t", capacity: 1, refillPerSec: 0.01, keyFn: () => "same" }))
      a.get("/", (req, res) => res.json({ ok: true }))
      expect((await request(a).get("/")).status).toBe(200)
      const blocked = await request(a).get("/")
      expect(blocked.status).toBe(429)
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0)
    } finally {
      delete process.env.RATE_LIMIT_IN_TESTS
    }
  })
})

describe("redis rate-limit store", () => {
  test("counts hits across calls and reports a reset time", async () => {
    const store = new RedisRateStore("unit")
    store.init({ windowMs: 60000 })
    const a = await store.increment("ip1")
    const b = await store.increment("ip1")
    expect([a.totalHits, b.totalHits]).toEqual([1, 2])
    expect(b.resetTime.getTime()).toBeGreaterThan(Date.now())
    await store.resetKey("ip1")
    expect((await store.increment("ip1")).totalHits).toBe(1)
  })

  test("two store instances (two API processes) share one counter", async () => {
    const one = new RedisRateStore("shared")
    const two = new RedisRateStore("shared")
    one.init({ windowMs: 60000 })
    two.init({ windowMs: 60000 })
    await one.increment("ip")
    expect((await two.increment("ip")).totalHits).toBe(2)
  })
})

describe("token revocation and logout", () => {
  test("a revoked jti is rejected, others are not", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600
    await revokeToken({ jti: "abc", exp })
    expect(await isRevoked("abc")).toBe(true)
    expect(await isRevoked("other")).toBe(false)
    const ttl = await redis.ttl("revoked:abc")
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(600)
  })

  test("logout ends that session: the same token is refused afterwards", async () => {
    await createUser({ email: "out@example.com" })
    const login = await request(app).post("/api/v1/auth/login").send({ email: "out@example.com", password: "Password123" })
    expect(login.status).toBe(200)
    const token = login.body.token
    expect(jwt.decode(token).jti).toBeTruthy()

    const auth = { Authorization: `Bearer ${token}` }
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(auth)).status).toBe(200)
    expect((await request(app).post("/api/v1/auth/logout").set(auth)).status).toBe(200)
    const after = await request(app).get("/api/v1/profile/getUserDetails").set(auth)
    expect(after.status).toBe(401)
  })

  test("fails open when Redis is down (other checks still apply)", async () => {
    setRedisForTests(null)
    expect(await isRevoked("anything-not-local")).toBe(false)
  })
})
