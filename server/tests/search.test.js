const request = require("supertest")
const app = require("../app")
const Course = require("../models/Course")
const { filtersFor, toCourse, SORTS } = require("../search/courseSearch")
const { mappings } = require("../search/courseIndex")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)

afterAll(async () => {
  await stopTestDb()
})

afterEach(async () => {
  delete process.env.ELASTICSEARCH_URL
  await clearTestDb()
})

async function publish(instructor, overrides) {
  return Course.create({
    courseName: "JavaScript Fundamentals",
    courseDescription: "Variables and functions",
    instructor: instructor._id,
    whatYouWillLearn: "JS",
    price: 499,
    tag: ["javascript"],
    thumbnail: "http://example.com/t.jpg",
    instructions: ["none"],
    status: "Published",
    ...overrides,
  })
}

describe("query building", () => {
  test("filters become term/range clauses; empty values are ignored", () => {
    expect(filtersFor({ category: "c1", minPrice: 100, maxPrice: "", minRating: 4 })).toEqual([
      { term: { categoryId: "c1" } },
      { range: { price: { gte: 100 } } },
      { range: { avgRating: { gte: 4 } } },
    ])
    expect(filtersFor({})).toEqual([])
  })

  test("hits are shaped like the course objects the UI renders", () => {
    const course = toCourse({
      _id: "abc",
      _source: { courseName: "React", instructorName: "Ada Love Lace", categoryId: "c", categoryName: "Web", price: 0, avgRating: 4.5, ratingCount: 2 },
      highlight: { "courseName.autocomplete": ["<mark>Re</mark>act"] },
    })
    expect(course).toMatchObject({
      _id: "abc",
      instructor: { firstName: "Ada", lastName: "Love Lace" },
      category: { _id: "c", name: "Web" },
      highlight: { courseName: "<mark>Re</mark>act" },
    })
  })

  test("the mapping is strict and every sort uses mapped fields", () => {
    expect(mappings.dynamic).toBe("strict")
    const fields = new Set([...Object.keys(mappings.properties), "_score"])
    for (const sort of Object.values(SORTS)) {
      for (const clause of sort) expect(fields.has(Object.keys(clause)[0])).toBe(true)
    }
  })
})

describe("MongoDB fallback", () => {
  test("without Elasticsearch, search and suggest use MongoDB", async () => {
    const instructor = await createUser({ email: "si@example.com", accountType: "Instructor" })
    await publish(instructor)
    await publish(instructor, { courseName: "Hidden draft", status: "Draft" })

    const res = await request(app).post("/api/v1/course/searchCourses").send({ search: "java" })
    expect(res.body.engine).toBe("mongo")
    expect(res.body.data.map((c) => c.courseName)).toEqual(["JavaScript Fundamentals"])

    const suggest = await request(app).get("/api/v1/course/suggest?q=java")
    expect(suggest.body).toMatchObject({ engine: "mongo", data: [{ courseName: "JavaScript Fundamentals" }] })
  })

  test("if Elasticsearch is unreachable the request still succeeds from MongoDB", async () => {
    const instructor = await createUser({ email: "si2@example.com", accountType: "Instructor" })
    await publish(instructor)
    process.env.ELASTICSEARCH_URL = "http://127.0.0.1:1" // nothing listens here
    const res = await request(app).post("/api/v1/course/searchCourses").send({ search: "java" })
    expect(res.status).toBe(200)
    expect(res.body.engine).toBe("mongo")
    expect(res.body.data).toHaveLength(1)
  })
})

// Real Elasticsearch: ES_TEST_URL=http://127.0.0.1:9200 npx jest tests/search.test.js
const esUrl = process.env.ES_TEST_URL
;(esUrl ? describe : describe.skip)("Elasticsearch integration", () => {
  const ALIAS = `courses_test_${Date.now()}`
  const courseIndex = require("../search/courseIndex")
  const courseSearch = require("../search/courseSearch")
  const { es } = require("../config/elasticsearch")

  beforeAll(() => {
    process.env.ELASTICSEARCH_INDEX = ALIAS
  })

  afterAll(async () => {
    process.env.ELASTICSEARCH_URL = esUrl
    const targets = Object.keys(await es("GET", `/_alias/${ALIAS}`).catch(() => ({})))
    for (const index of targets) await es("DELETE", `/${index}`).catch(() => {})
    delete process.env.ELASTICSEARCH_INDEX
  })

  test("typos, partial words, facets and live index updates", async () => {
    process.env.ELASTICSEARCH_URL = esUrl
    const instructor = await createUser({ email: "es@example.com", accountType: "Instructor" })
    const js = await publish(instructor)
    await publish(instructor, { courseName: "Python for Data Analysis", tag: ["python"], price: 0 })

    const built = await courseIndex.rebuild()
    expect(built.count).toBe(2)

    const typo = await courseSearch.search({ search: "javscript" })
    expect(typo.data.map((c) => c.courseName)).toEqual(["JavaScript Fundamentals"])

    const partial = await courseSearch.suggest("pyth")
    expect(partial[0].highlight).toBe("<mark>Python</mark> for Data Analysis")

    const free = await courseSearch.search({ maxPrice: 0 })
    expect(free.data.map((c) => c.courseName)).toEqual(["Python for Data Analysis"])
    expect(free.facets.price.find((b) => b.key === "free").count).toBe(1)

    // Archiving removes it from the index on the next update.
    await Course.updateOne({ _id: js._id }, { deletedAt: new Date() })
    await courseIndex.indexCourse(String(js._id))
    await es("POST", `/${ALIAS}/_refresh`)
    expect((await courseSearch.search({ search: "javascript" })).pagination.total).toBe(0)
  }, 30000)
})

describe("notification feed cursor pagination", () => {
  test("pages do not overlap or skip, even with equal timestamps", async () => {
    const Notification = require("../models/Notification")
    const { tokenFor } = require("./helpers")
    const user = await createUser({ email: "feed@example.com" })
    const same = new Date()
    await Notification.insertMany(
      Array.from({ length: 7 }, (_, i) => ({ user: user._id, message: `n${i}`, createdAt: i < 4 ? same : new Date(same - i * 1000) }))
    )
    const get = (q = "") =>
      request(app).get(`/api/v1/notification/mine?limit=3${q}`).set("Authorization", `Bearer ${tokenFor(user)}`)
    const seen = []
    let cursor = null
    do {
      const res = await get(cursor ? `&before=${cursor}` : "")
      seen.push(...res.body.data.map((n) => n.message))
      cursor = res.body.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
    expect((await get("&before=nonsense")).status).toBe(400)
  })
})
