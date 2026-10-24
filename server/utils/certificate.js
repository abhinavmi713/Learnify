const { v4: uuidv4 } = require("uuid")
const Course = require("../models/Course")
const CourseProgress = require("../models/CourseProgress")
const Quiz = require("../models/Quiz")
const QuizAttempt = require("../models/QuizAttempt")
const Certificate = require("../models/Certificate")
const { notifyUser } = require("./notify")
const { runInTransaction } = require("./transaction")
const { enqueueEvent } = require("../events/outbox")
const { EVENTS } = require("../events/types")

// A certificate is earned once a student has watched every lecture in the
// course AND passed every quiz attached to it (if any exist). Called after
// both lecture-completion and quiz-submission, since either could be the
// final missing piece.
async function checkAndIssueCertificate(userId, courseId) {
  const existing = await Certificate.findOne({ user: userId, course: courseId })
  if (existing) return existing

  const course = await Course.findById(courseId).populate({
    path: "courseContent",
    populate: { path: "subSection" },
  })
  if (!course) return null

  const totalLectures = course.courseContent.reduce(
    (sum, section) => sum + section.subSection.length,
    0
  )
  if (totalLectures === 0) return null

  const progress = await CourseProgress.findOne({ courseID: courseId, userId })
  const completedCount = progress?.completedVideos?.length || 0
  if (completedCount < totalLectures) return null

  const quizzes = await Quiz.find({ course: courseId }).select("_id")
  if (quizzes.length > 0) {
    const attempts = await QuizAttempt.find({
      user: userId,
      quiz: { $in: quizzes.map((q) => q._id) },
      passed: true,
    }).select("quiz")
    const passedQuizIds = new Set(attempts.map((a) => a.quiz.toString()))
    const allQuizzesPassed = quizzes.every((q) => passedQuizIds.has(q._id.toString()))
    if (!allQuizzesPassed) return null
  }

  try {
    // The certificate and the "course.completed" event (which triggers the
    // congratulation email) are saved atomically.
    const certificate = await runInTransaction(async (session) => {
      const [created] = await Certificate.create(
        [{ certificateId: uuidv4(), user: userId, course: courseId }],
        session ? { session } : {}
      )
      await enqueueEvent(
        EVENTS.COURSE_COMPLETED,
        { userId: String(userId), courseId: String(courseId), certificateId: created.certificateId },
        { session }
      )
      return created
    })
    await notifyUser(
      userId,
      `You earned a certificate for completing "${course.courseName}"!`,
      `/dashboard/certificates`
    )
    return certificate
  } catch (error) {
    // Race condition: another request issued it a moment ago (unique index) — fine, fetch it.
    if (error.code === 11000) {
      return await Certificate.findOne({ user: userId, course: courseId })
    }
    throw error
  }
}

module.exports = { checkAndIssueCertificate }
