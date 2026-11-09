// Search fixes (M40, L45, L49) with Elasticsearch replaced by a stand-in.
process.env.ELASTICSEARCH_URL = "http://search.test:9200"

const mockCalls = []
let mockBehaviour = () => ({})
jest.mock("../config/elasticsearch", () => ({
  isConfigured: () => true,
  registerHealth: () => {},
  es: (...args) => {
    mockCalls.push(args)
    return mockBehaviour(...args)
  },
}))

const Course = require("../models/Course")
const { search } = require("../search/courseSearch")
const { indexCourse, rebuild } = require("../search/courseIndex")
const { breakerStates } = require("../utils/resilience")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)
afterAll(async () => {
  await stopTestDb()
})
afterEach(async () => {
  mockCalls.length = 0
  mockBehaviour = () => ({})
  await clearTestDb()
})

const emptyResult = { took: 1, hits: { total: { value: 0 }, hits: [] }, aggregations: { categories: { buckets: [] }, price: { buckets: [] }, rating: { buckets: [] } } }

describe("M40: deep pages", () => {
  test("never ask Elasticsearch past 10,000 results", async () => {
    mockBehaviour = () => emptyResult
    await search({ search: "x", page: 900, limit: 12 })
    const body = mockCalls[0][2]
    expect(body.from + body.size).toBeLessThanOrEqual(10000)
  })

  test("a client error doesn't open the breaker", async () => {
    mockBehaviour = () => {
      throw Object.assign(new Error("bad request"), { status: 400 })
    }
    for (let i = 0; i < 8; i++) await search({ search: "x" }).catch(() => {})
    expect(breakerStates()["elasticsearch-search"]).toBe("closed")
  })
})

describe("L45: index writes retry a brief failure", () => {
  test("a 503 is retried", async () => {
    const owner = await createUser({ email: "es@example.com", accountType: "Instructor" })
    const c = await Course.create({ courseName: "C", instructor: owner._id, status: "Published", thumbnail: "t", price: 1 })
    let attempts = 0
    mockBehaviour = (method) => {
      if (method === "PUT" && ++attempts === 1) throw Object.assign(new Error("unavailable"), { status: 503 })
      return {}
    }
    await expect(indexCourse(String(c._id))).resolves.toEqual({ indexed: true })
    expect(attempts).toBe(2)
  })
})

describe("L49: edits during a rebuild", () => {
  test("courses changed while it ran are indexed again after the switch", async () => {
    const owner = await createUser({ email: "es2@example.com", accountType: "Instructor" })
    const c = await Course.create({ courseName: "Old name", instructor: owner._id, status: "Published", thumbnail: "t", price: 1 })
    const order = []
    mockBehaviour = async (method, path, body) => {
      order.push(`${method} ${path}`)
      if (path === "/_bulk") await Course.updateOne({ _id: c._id }, { courseName: "New name" })
      if (method === "GET" && path.startsWith("/_alias/")) return {}
      if (path === "/_bulk") return { errors: false }
      return {}
    }
    const result = await rebuild()
    expect(result.changedDuringRebuild).toBe(1)
    const swap = order.findIndex((o) => o === "POST /_aliases")
    const reindex = order.findIndex((o, i) => i > swap && o.startsWith(`PUT /courses/_doc/${c._id}`))
    expect(reindex).toBeGreaterThan(swap)
  })
})
