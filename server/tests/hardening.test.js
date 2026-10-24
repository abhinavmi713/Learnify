jest.mock("../utils/mailSender", () => jest.fn().mockResolvedValue({ response: "mocked" }))

const request = require("supertest")
const app = require("../app")
const Course = require("../models/Course")
const User = require("../models/User")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)
afterAll(async () => {
  await stopTestDb()
})
afterEach(async () => {
  await clearTestDb()
})

const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` })

const makeCourse = (instructor, overrides = {}) =>
  Course.create({
    courseName: "Course",
    courseDescription: "desc",
    instructor: instructor._id,
    whatYouWillLearn: "stuff",
    price: 100,
    tag: ["t"],
    thumbnail: "http://example.com/t.jpg",
    instructions: ["x"],
    status: "Published",
    ...overrides,
  })

test("/health reports the database as connected", async () => {
  const res = await request(app).get("/health")
  expect(res.status).toBe(200)
  expect(res.body).toMatchObject({ status: "ok", db: "connected" })
})

test("the chatbot endpoint requires a logged-in user", async () => {
  const res = await request(app).post("/api/v1/chatbot/chat").send({ message: "hi" })
  expect(res.status).toBe(401)
})

describe("deleting an account", () => {
  test("locks it out but frees the email so the person can register again", async () => {
    const user = await createUser({ email: "leaving@example.com", password: "Password123" })

    const del = await request(app).delete("/api/v1/profile/deleteProfile").set(auth(user))
    expect(del.status).toBe(200)

    const stored = await User.findById(user._id)
    expect(stored.deletedAt).not.toBeNull()
    expect(stored.originalEmail).toBe("leaving@example.com")

    // The old session is dead...
    const stale = await request(app).get("/api/v1/profile/getUserDetails").set(auth(user))
    expect(stale.status).toBe(403)
    // ...the old address no longer logs in...
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "leaving@example.com", password: "Password123" })
    expect(login.status).toBe(401)
    // ...and the address can be registered again.
    await expect(createUser({ email: "leaving@example.com" })).resolves.toBeTruthy()
  })
})

describe("catalog cache + archive/restore", () => {
  test("a deleted course disappears from the cached catalog immediately, and an admin can restore it", async () => {
    const instructor = await createUser({ email: "i@example.com", accountType: "Instructor" })
    const admin = await createUser({ email: "a@example.com", accountType: "Admin" })
    const course = await makeCourse(instructor)
    const id = course._id.toString()
    const listed = async () =>
      (await request(app).get("/api/v1/course/getAllCourses")).body.data.some((c) => c._id === id)

    expect(await listed()).toBe(true) // primes the 60s cache
    await request(app).delete("/api/v1/course/deleteCourse").set(auth(instructor)).send({ courseId: id })
    expect(await listed()).toBe(false) // would still be true if the cache weren't invalidated

    const archived = await request(app).get("/api/v1/admin/courses/archived").set(auth(admin))
    expect(archived.body.data.map((c) => c._id)).toContain(id)

    const restored = await request(app).post("/api/v1/admin/courses/restore").set(auth(admin)).send({ courseId: id })
    expect(restored.status).toBe(200)
    expect(await listed()).toBe(true)
  })

  test("only admins can see or restore archived courses", async () => {
    const instructor = await createUser({ email: "i2@example.com", accountType: "Instructor" })
    expect((await request(app).get("/api/v1/admin/courses/archived").set(auth(instructor))).status).toBe(401)
  })
})

describe("request validation on previously unchecked endpoints", () => {
  test("editCourse rejects a malformed tag list before touching anything", async () => {
    const instructor = await createUser({ email: "i3@example.com", accountType: "Instructor" })
    const course = await makeCourse(instructor)
    const res = await request(app)
      .post("/api/v1/course/editCourse")
      .set(auth(instructor))
      .send({ courseId: course._id.toString(), tag: "not json" })
    expect(res.status).toBe(400)
  })

  test("createRating rejects an out-of-range rating", async () => {
    const student = await createUser({ email: "s@example.com" })
    const res = await request(app)
      .post("/api/v1/course/createRating")
      .set(auth(student))
      .send({ courseId: "a".repeat(24), rating: 9, review: "great" })
    expect(res.status).toBe(400)
  })

  test("the contact form rejects an invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/reach/contact")
      .send({ email: "nope", firstname: "A", message: "hi" })
    expect(res.status).toBe(400)
  })

  test("discussion posts are length-limited", async () => {
    const student = await createUser({ email: "s2@example.com" })
    const res = await request(app)
      .post("/api/v1/discussion/create")
      .set(auth(student))
      .send({ courseId: "a".repeat(24), subsectionId: "b".repeat(24), text: "x".repeat(2001) })
    expect(res.status).toBe(400)
  })
})
