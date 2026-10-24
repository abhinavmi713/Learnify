const request = require("supertest")
const app = require("../app")
const Course = require("../models/Course")
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const CourseProgress = require("../models/CourseProgress")
const Certificate = require("../models/Certificate")
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

// Sets up one course with a single lecture, an enrolled student who has
// already watched that lecture, and returns everything a test needs.
async function setupCourseWithCompletedLecture() {
  const instructor = await createUser({ email: "instructor@example.com", accountType: "Instructor" })
  const student = await createUser({ email: "student@example.com", accountType: "Student" })

  const subsection = await SubSection.create({ title: "Lecture 1", timeDuration: "60" })
  const section = await Section.create({ sectionName: "Section 1", subSection: [subsection._id] })
  const course = await Course.create({
    courseName: "Quiz Course",
    courseDescription: "desc",
    instructor: instructor._id,
    whatYouWillLearn: "stuff",
    price: 0,
    tag: ["test"],
    thumbnail: "http://example.com/thumb.jpg",
    instructions: ["watch"],
    status: "Published",
    courseContent: [section._id],
    studentsEnroled: [student._id],
  })

  await CourseProgress.create({
    courseID: course._id,
    userId: student._id,
    completedVideos: [subsection._id],
  })

  return { instructor, student, course }
}

describe("quiz creation and grading", () => {
  test("a non-owning instructor cannot create a quiz for someone else's course", async () => {
    const { course } = await setupCourseWithCompletedLecture()
    const otherInstructor = await createUser({ email: "other@example.com", accountType: "Instructor" })

    const res = await request(app)
      .post("/api/v1/quiz/create")
      .set("Authorization", `Bearer ${tokenFor(otherInstructor)}`)
      .send({
        courseId: course._id.toString(),
        title: "Sneaky Quiz",
        passingScore: 50,
        questions: [{ questionText: "Q?", options: ["A", "B"], correctOptionIndex: 0 }],
      })

    expect(res.status).toBe(403)
  })

  test("the student never sees correctOptionIndex before submitting", async () => {
    const { instructor, student, course } = await setupCourseWithCompletedLecture()

    const createRes = await request(app)
      .post("/api/v1/quiz/create")
      .set("Authorization", `Bearer ${tokenFor(instructor)}`)
      .send({
        courseId: course._id.toString(),
        title: "Basics",
        passingScore: 50,
        questions: [
          { questionText: "2+2?", options: ["3", "4"], correctOptionIndex: 1 },
        ],
      })
    expect(createRes.status).toBe(201)

    const listRes = await request(app)
      .get(`/api/v1/quiz/student?courseId=${course._id}`)
      .set("Authorization", `Bearer ${tokenFor(student)}`)
    expect(listRes.status).toBe(200)
    expect(listRes.body.data[0].questions[0].correctOptionIndex).toBeUndefined()
  })

  test("submitting correct answers is graded 100% server-side, regardless of a forged client score", async () => {
    const { instructor, student, course } = await setupCourseWithCompletedLecture()

    const createRes = await request(app)
      .post("/api/v1/quiz/create")
      .set("Authorization", `Bearer ${tokenFor(instructor)}`)
      .send({
        courseId: course._id.toString(),
        title: "Basics",
        passingScore: 50,
        questions: [
          { questionText: "2+2?", options: ["3", "4"], correctOptionIndex: 1 },
        ],
      })
    const quiz = createRes.body.data
    const questionId = quiz.questions[0]._id

    const submitRes = await request(app)
      .post("/api/v1/quiz/submit")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send({
        quizId: quiz._id,
        answers: [{ question: questionId, selectedOptionIndex: 1 }],
        // A forged score/passed the server must ignore entirely.
        score: 0,
        passed: false,
      })

    expect(submitRes.status).toBe(200)
    expect(submitRes.body.data.score).toBe(100)
    expect(submitRes.body.data.passed).toBe(true)
  })

  test("passing the only quiz after completing every lecture issues a certificate", async () => {
    const { instructor, student, course } = await setupCourseWithCompletedLecture()

    const createRes = await request(app)
      .post("/api/v1/quiz/create")
      .set("Authorization", `Bearer ${tokenFor(instructor)}`)
      .send({
        courseId: course._id.toString(),
        title: "Final",
        passingScore: 50,
        questions: [
          { questionText: "2+2?", options: ["3", "4"], correctOptionIndex: 1 },
        ],
      })
    const quiz = createRes.body.data
    const questionId = quiz.questions[0]._id

    const submitRes = await request(app)
      .post("/api/v1/quiz/submit")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send({
        quizId: quiz._id,
        answers: [{ question: questionId, selectedOptionIndex: 1 }],
      })

    expect(submitRes.body.certificateIssued).toBe(true)
    const cert = await Certificate.findOne({ user: student._id, course: course._id })
    expect(cert).not.toBeNull()
  })

  test("failing the quiz does not issue a certificate", async () => {
    const { instructor, student, course } = await setupCourseWithCompletedLecture()

    const createRes = await request(app)
      .post("/api/v1/quiz/create")
      .set("Authorization", `Bearer ${tokenFor(instructor)}`)
      .send({
        courseId: course._id.toString(),
        title: "Final",
        passingScore: 50,
        questions: [
          { questionText: "2+2?", options: ["3", "4"], correctOptionIndex: 1 },
        ],
      })
    const quiz = createRes.body.data
    const questionId = quiz.questions[0]._id

    const submitRes = await request(app)
      .post("/api/v1/quiz/submit")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send({
        quizId: quiz._id,
        answers: [{ question: questionId, selectedOptionIndex: 0 }], // wrong answer
      })

    expect(submitRes.body.data.passed).toBe(false)
    expect(submitRes.body.certificateIssued).toBe(false)
    expect(await Certificate.findOne({ user: student._id, course: course._id })).toBeNull()
  })
})
