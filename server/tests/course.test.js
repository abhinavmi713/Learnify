const request = require("supertest")
const app = require("../app")
const Course = require("../models/Course")
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

async function createCourse(instructorId, overrides = {}) {
  return Course.create({
    courseName: "Owned Course",
    courseDescription: "desc",
    instructor: instructorId,
    whatYouWillLearn: "stuff",
    price: 100,
    tag: ["test"],
    thumbnail: "http://example.com/thumb.jpg",
    instructions: ["do the thing"],
    status: "Draft",
    ...overrides,
  })
}

describe("course ownership authorization", () => {
  test("an instructor cannot edit another instructor's course", async () => {
    const owner = await createUser({ email: "owner@example.com", accountType: "Instructor" })
    const intruder = await createUser({ email: "intruder@example.com", accountType: "Instructor" })
    const course = await createCourse(owner._id)

    const res = await request(app)
      .post("/api/v1/course/editCourse")
      .set("Authorization", `Bearer ${tokenFor(intruder)}`)
      .send({ courseId: course._id.toString(), courseName: "Hijacked" })

    expect(res.status).toBe(403)
    const unchanged = await Course.findById(course._id)
    expect(unchanged.courseName).toBe("Owned Course")
  })

  test("an instructor cannot delete another instructor's course", async () => {
    const owner = await createUser({ email: "owner2@example.com", accountType: "Instructor" })
    const intruder = await createUser({ email: "intruder2@example.com", accountType: "Instructor" })
    const course = await createCourse(owner._id)

    const res = await request(app)
      .delete("/api/v1/course/deleteCourse")
      .set("Authorization", `Bearer ${tokenFor(intruder)}`)
      .send({ courseId: course._id.toString() })

    expect(res.status).toBe(403)
    expect(await Course.findById(course._id)).not.toBeNull()
  })

  test("the owning instructor can edit their own course", async () => {
    const owner = await createUser({ email: "owner3@example.com", accountType: "Instructor" })
    const course = await createCourse(owner._id)

    const res = await request(app)
      .post("/api/v1/course/editCourse")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .send({ courseId: course._id.toString(), courseName: "Updated Name" })

    expect(res.status).toBe(200)
    const updated = await Course.findById(course._id)
    expect(updated.courseName).toBe("Updated Name")
  })

  test("an instructor cannot self-publish a course — only admin approval can", async () => {
    const owner = await createUser({ email: "owner4@example.com", accountType: "Instructor" })
    const course = await createCourse(owner._id)

    const res = await request(app)
      .post("/api/v1/course/editCourse")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .send({ courseId: course._id.toString(), status: "Published" })

    expect(res.status).toBe(403)
    const unchanged = await Course.findById(course._id)
    expect(unchanged.status).toBe("Draft")
  })

  test("an instructor can submit their course for review (Pending)", async () => {
    const owner = await createUser({ email: "owner5@example.com", accountType: "Instructor" })
    const course = await createCourse(owner._id)

    const res = await request(app)
      .post("/api/v1/course/editCourse")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .send({ courseId: course._id.toString(), status: "Pending" })

    expect(res.status).toBe(200)
    const updated = await Course.findById(course._id)
    expect(updated.status).toBe("Pending")
  })
})

describe("deleting a course is a soft delete", () => {
  test("deleteCourse archives the course instead of destroying it, and it drops out of public listings", async () => {
    const owner = await createUser({ email: "owner6@example.com", accountType: "Instructor" })
    const course = await createCourse(owner._id, { status: "Published" })

    const res = await request(app)
      .delete("/api/v1/course/deleteCourse")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .send({ courseId: course._id.toString() })

    expect(res.status).toBe(200)

    // The document still exists — nothing was actually destroyed.
    const stillExists = await Course.findById(course._id)
    expect(stillExists).not.toBeNull()
    expect(stillExists.deletedAt).not.toBeNull()

    // But it no longer shows up in the public catalog or the instructor's
    // own active course list.
    const publicRes = await request(app).get("/api/v1/course/getAllCourses")
    expect(publicRes.body.data.find((c) => c._id === course._id.toString())).toBeUndefined()

    const instructorRes = await request(app)
      .get("/api/v1/course/getInstructorCourses")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
    expect(instructorRes.body.data.find((c) => c._id === course._id.toString())).toBeUndefined()
  })
})
