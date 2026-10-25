jest.mock("../utils/aiService", () => ({ isConfigured: jest.fn(() => true), ask: jest.fn() }))
jest.mock("../utils/gemini", () => ({ callGemini: jest.fn(async () => "plain answer") }))

const request = require("supertest")
const app = require("../app")
const Course = require("../models/Course")
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const OutboxEvent = require("../models/OutboxEvent")
const aiService = require("../utils/aiService")
const { callGemini } = require("../utils/gemini")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")

const TOKEN = "i".repeat(32)

beforeAll(async () => {
  process.env.INTERNAL_API_TOKEN = TOKEN
  await startTestDb()
}, 120000)

afterAll(async () => {
  delete process.env.INTERNAL_API_TOKEN
  await stopTestDb()
})

afterEach(async () => {
  jest.clearAllMocks()
  await clearTestDb()
})

async function courseWithLecture(instructorId, overrides = {}) {
  const lecture = await SubSection.create({
    title: "Closures",
    description: "Functions that remember",
    transcript: "A closure keeps its scope alive.",
    videoUrl: "https://res.cloudinary.com/demo/video/upload/x.mp4",
  })
  const section = await Section.create({ sectionName: "Core", subSection: [lecture._id] })
  return Course.create({
    courseName: "JS",
    courseDescription: "desc",
    instructor: instructorId,
    whatYouWillLearn: "stuff",
    price: 100,
    tag: ["js"],
    thumbnail: "http://example.com/t.jpg",
    instructions: ["none"],
    courseContent: [section._id],
    status: "Published",
    ...overrides,
  })
}

describe("internal API (for the AI service)", () => {
  test("rejects calls without the shared token", async () => {
    expect((await request(app).get("/api/v1/internal/courses")).status).toBe(401)
    const wrong = await request(app).get("/api/v1/internal/courses").set("X-Internal-Token", "x".repeat(32))
    expect(wrong.status).toBe(401)
  })

  test("serves course content with transcripts and lists only published courses", async () => {
    const instructor = await createUser({ email: "ins@example.com", accountType: "Instructor" })
    const published = await courseWithLecture(instructor._id)
    const draft = await courseWithLecture(instructor._id, { status: "Draft" })

    const list = await request(app).get("/api/v1/internal/courses").set("X-Internal-Token", TOKEN)
    expect(list.body.data).toEqual([String(published._id)])

    const content = await request(app).get(`/api/v1/internal/courses/${draft._id}/content`).set("X-Internal-Token", TOKEN)
    expect(content.status).toBe(200)
    expect(content.body.data.searchable).toBe(false)
    expect(content.body.data.sections[0].lectures[0]).toMatchObject({ title: "Closures", transcript: "A closure keeps its scope alive." })
  })

  test("public course details never expose transcripts", async () => {
    const instructor = await createUser({ email: "ins2@example.com", accountType: "Instructor" })
    const course = await courseWithLecture(instructor._id)
    const res = await request(app).post("/api/v1/course/getCourseDetails").send({ courseId: String(course._id) })
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain("A closure keeps its scope alive.")
  })
})

test("editing course content records a course.content_changed event", async () => {
  const instructor = await createUser({ email: "ins3@example.com", accountType: "Instructor" })
  const course = await courseWithLecture(instructor._id)
  const sectionId = String(course.courseContent[0])
  const lecture = (await Section.findById(sectionId)).subSection[0]

  const res = await request(app)
    .post("/api/v1/course/updateSubSection")
    .set("Authorization", `Bearer ${tokenFor(instructor)}`)
    .send({ sectionId, subSectionId: String(lecture), transcript: "New transcript" })
  expect(res.status).toBe(200)
  expect((await SubSection.findById(lecture)).transcript).toBe("New transcript")

  // recorded after the response has finished
  let event = null
  for (let i = 0; i < 20 && !event; i++) {
    event = await OutboxEvent.findOne({ type: "course.content_changed" })
    if (!event) await new Promise((r) => setTimeout(r, 50))
  }
  expect(event.payload).toEqual({ courseId: String(course._id) })
})

describe("chatbot", () => {
  const ask = (user, body) =>
    request(app).post("/api/v1/chatbot/chat").set("Authorization", `Bearer ${tokenFor(user)}`).send(body)

  test("an enrolled student gets a course-grounded answer with citations", async () => {
    const instructor = await createUser({ email: "ins4@example.com", accountType: "Instructor" })
    const student = await createUser({ email: "stu4@example.com" })
    const course = await courseWithLecture(instructor._id, { studentsEnroled: [student._id] })
    aiService.ask.mockResolvedValue({ answer: "It keeps scope [1].", grounded: true, citations: [{ title: "Closures" }] })

    const res = await ask(student, { courseId: String(course._id), message: "What is a closure?" })
    expect(res.body).toMatchObject({ reply: "It keeps scope [1].", grounded: true, courseId: String(course._id) })
    expect(aiService.ask).toHaveBeenCalledWith({ courseId: String(course._id), courseName: "JS", question: "What is a closure?" })
  })

  test("someone not in the course never reaches its material", async () => {
    const instructor = await createUser({ email: "ins5@example.com", accountType: "Instructor" })
    const outsider = await createUser({ email: "out5@example.com" })
    const course = await courseWithLecture(instructor._id)

    const res = await ask(outsider, { courseId: String(course._id), message: "What is a closure?" })
    expect(res.body).toMatchObject({ reply: "plain answer", grounded: false, citations: [] })
    expect(aiService.ask).not.toHaveBeenCalled()
    expect(callGemini.mock.calls[0][0]).not.toContain("Closures")
  })

  test("falls back to a plain answer when the AI service fails", async () => {
    const instructor = await createUser({ email: "ins6@example.com", accountType: "Instructor" })
    const student = await createUser({ email: "stu6@example.com" })
    const course = await courseWithLecture(instructor._id, { studentsEnroled: [student._id] })
    aiService.ask.mockRejectedValue(new Error("ai-service responded 502"))

    const res = await ask(student, { courseId: String(course._id), message: "What is a closure?" })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ reply: "plain answer", grounded: false })
  })
})
