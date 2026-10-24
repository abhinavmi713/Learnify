const { parseEnv } = require("../config/env")
const { registerCheck, runChecks, resetChecks } = require("../utils/health")

const base = { JWT_SECRET: "x".repeat(32), MONGODB_URL: "mongodb://127.0.0.1:27017/learnify" }

describe("environment validation", () => {
  test("accepts a minimal valid config and applies defaults", () => {
    const r = parseEnv(base)
    expect(r.success).toBe(true)
    expect(r.data.PORT).toBe(4000)
    expect(r.data.REDIS_URL).toBeUndefined()
  })

  test("rejects a missing or short JWT secret and a non-mongo URL", () => {
    const r = parseEnv({ JWT_SECRET: "short", MONGODB_URL: "http://nope" })
    expect(r.success).toBe(false)
    const paths = r.error.issues.map((i) => i.path[0])
    expect(paths).toEqual(expect.arrayContaining(["JWT_SECRET", "MONGODB_URL"]))
  })

  test("treats empty optional service URLs as unset, rejects wrong schemes", () => {
    expect(parseEnv({ ...base, REDIS_URL: "" }).data.REDIS_URL).toBeUndefined()
    expect(parseEnv({ ...base, REDIS_URL: "http://wrong" }).success).toBe(false)
    expect(parseEnv({ ...base, RABBITMQ_URL: "amqp://guest:guest@h:5672" }).success).toBe(true)
  })

  test("production demands a long secret and a real client origin", () => {
    const r = parseEnv({ ...base, NODE_ENV: "production", JWT_SECRET: "y".repeat(20) })
    expect(r.success).toBe(false)
    const paths = r.error.issues.map((i) => i.path[0])
    expect(paths).toEqual(expect.arrayContaining(["JWT_SECRET", "CLIENT_URL"]))
  })
})

describe("health registry", () => {
  beforeEach(resetChecks)

  test("a failing non-critical dependency does not fail the overall check", async () => {
    registerCheck("redis", () => { throw new Error("refused") })
    registerCheck("mongo", () => {}, { critical: true })
    const { ok, dependencies } = await runChecks()
    expect(ok).toBe(true)
    expect(dependencies.redis.status).toBe("down")
    expect(dependencies.mongo.status).toBe("up")
  })

  test("a failing critical dependency fails the overall check", async () => {
    registerCheck("mongo", () => { throw new Error("gone") }, { critical: true })
    expect((await runChecks()).ok).toBe(false)
  })

  test("a hanging probe times out instead of hanging /health", async () => {
    registerCheck("slow", () => new Promise(() => {}), { timeoutMs: 50 })
    const { dependencies } = await runChecks()
    expect(dependencies.slow.error).toBe("timeout")
  })
})
