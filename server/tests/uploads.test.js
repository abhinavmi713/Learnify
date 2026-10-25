process.env.CLOUD_NAME = "testcloud"
process.env.API_KEY = "123456"
process.env.API_SECRET = "test-api-secret"
process.env.FOLDER_NAME = "Learnify"

const request = require("supertest")
const app = require("../app")
const Course = require("../models/Course")
const Section = require("../models/Section")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")
const { isTrustedVideoUrl } = require("../utils/cloudinarySigner")

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
const GOOD_URL = "https://res.cloudinary.com/testcloud/video/upload/v1/Learnify/abc123.mp4"

describe("isTrustedVideoUrl", () => {
  test("accepts a video in our account and folder", () => {
    expect(isTrustedVideoUrl(GOOD_URL)).toBe(true)
  })

  test("accepts a video in a legacy folder listed in LEGACY_FOLDER_NAMES", () => {
    const legacy = "https://res.cloudinary.com/testcloud/video/upload/v1/CodeHelp/old.mp4"
    expect(isTrustedVideoUrl(legacy)).toBe(false)
    process.env.LEGACY_FOLDER_NAMES = "CodeHelp"
    try {
      expect(isTrustedVideoUrl(legacy)).toBe(true)
    } finally {
      delete process.env.LEGACY_FOLDER_NAMES
    }
  })

  test.each([
    ["another Cloudinary account", "https://res.cloudinary.com/demo/video/upload/v1/Learnify/x.mp4"],
    ["an arbitrary site", "https://evil.example.com/x.mp4"],
    ["our account but another folder", "https://res.cloudinary.com/testcloud/video/upload/v1/other/x.mp4"],
    ["an image, not a video", "https://res.cloudinary.com/testcloud/image/upload/v1/Learnify/x.png"],
    ["plain http", "http://res.cloudinary.com/testcloud/video/upload/v1/Learnify/x.mp4"],
    ["not a string", undefined],
  ])("rejects %s", (_label, url) => {
    expect(isTrustedVideoUrl(url)).toBe(false)
  })
})

describe("POST /course/uploadSignature", () => {
  test("gives an instructor signed params scoped to our folder", async () => {
    const instructor = await createUser({ email: "i@example.com", accountType: "Instructor" })
    const res = await request(app).post("/api/v1/course/uploadSignature").set(auth(instructor))

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ cloudName: "testcloud", apiKey: "123456", folder: "Learnify" })
    expect(res.body.data.signature).toMatch(/^[a-f0-9]{40,}$/)
    // The secret itself must never be sent to the browser.
    expect(JSON.stringify(res.body)).not.toContain("test-api-secret")
  })

  test("is not available to students or anonymous visitors", async () => {
    const student = await createUser({ email: "s@example.com", accountType: "Student" })
    expect((await request(app).post("/api/v1/course/uploadSignature").set(auth(student))).status).toBe(403)
    expect((await request(app).post("/api/v1/course/uploadSignature")).status).toBe(401)
  })
})

describe("addSubSection with a direct-uploaded video", () => {
  async function setup() {
    const instructor = await createUser({ email: "i2@example.com", accountType: "Instructor" })
    const section = await Section.create({ sectionName: "S1", subSection: [] })
    await Course.create({
      courseName: "C",
      courseDescription: "d",
      instructor: instructor._id,
      whatYouWillLearn: "w",
      price: 0,
      tag: ["t"],
      thumbnail: "http://x/t.jpg",
      instructions: ["i"],
      status: "Draft",
      courseContent: [section._id],
    })
    return { instructor, section }
  }
  const body = (section, extra) => ({ sectionId: section._id.toString(), title: "L1", description: "d", ...extra })

  test("stores the URL and duration for a trusted video", async () => {
    const { instructor, section } = await setup()
    const res = await request(app)
      .post("/api/v1/course/addSubSection")
      .set(auth(instructor))
      .send(body(section, { videoUrl: GOOD_URL, duration: 42.5 }))

    expect(res.status).toBe(200)
    const lecture = res.body.data.subSection[0]
    expect(lecture.videoUrl).toBe(GOOD_URL)
    expect(lecture.timeDuration).toBe("42.5")
  })

  test("refuses a video URL that isn't in our Cloudinary account", async () => {
    const { instructor, section } = await setup()
    const res = await request(app)
      .post("/api/v1/course/addSubSection")
      .set(auth(instructor))
      .send(body(section, { videoUrl: "https://evil.example.com/x.mp4" }))

    expect(res.status).toBe(400)
    expect((await Section.findById(section._id)).subSection).toHaveLength(0)
  })

  test("refuses a lecture with no video at all", async () => {
    const { instructor, section } = await setup()
    const res = await request(app).post("/api/v1/course/addSubSection").set(auth(instructor)).send(body(section))
    expect(res.status).toBe(400)
  })
})
