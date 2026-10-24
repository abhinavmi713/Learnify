const mongoose = require("mongoose")
const Quiz = require("../models/Quiz")
const QuizAttempt = require("../models/QuizAttempt")
const Course = require("../models/Course")
const { checkAndIssueCertificate } = require("../utils/certificate")
const { callGemini, extractJson } = require("../utils/gemini")

async function assertOwnsCourse(courseId, userId) {
  const course = await Course.findById(courseId)
  if (!course) return { error: "Course not found", status: 404 }
  if (course.instructor.toString() !== userId) {
    return { error: "You are not authorized to modify this course", status: 403 }
  }
  return { course }
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return "A quiz needs at least one question"
  }
  for (const q of questions) {
    if (!q.questionText || typeof q.questionText !== "string" || !q.questionText.trim()) {
      return "Every question needs text"
    }
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      return "Every question needs between 2 and 6 options"
    }
    if (
      typeof q.correctOptionIndex !== "number" ||
      q.correctOptionIndex < 0 ||
      q.correctOptionIndex >= q.options.length
    ) {
      return "correctOptionIndex must point to a valid option"
    }
  }
  return null
}

// Instructor: create a quiz for a course they own.
exports.createQuiz = async (req, res) => {
  try {
    const { courseId, title, passingScore, questions } = req.body
    if (!courseId || !mongoose.isValidObjectId(courseId) || !title?.trim()) {
      return res.status(400).json({ success: false, message: "courseId and title are required" })
    }
    const questionError = validateQuestions(questions)
    if (questionError) {
      return res.status(400).json({ success: false, message: questionError })
    }

    const { error, status, course } = await assertOwnsCourse(courseId, req.user.id)
    if (error) return res.status(status).json({ success: false, message: error })

    const quiz = await Quiz.create({
      course: course._id,
      title: title.trim(),
      passingScore: passingScore || 70,
      questions,
    })

    return res.status(201).json({ success: true, data: quiz })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to create quiz" })
  }
}

// Instructor: draft MCQ questions with AI from a topic description. Returns
// the draft for review/editing — nothing is saved until the instructor
// submits it through the normal createQuiz endpoint.
exports.generateQuizDraft = async (req, res) => {
  try {
    const { courseId, topic, numQuestions } = req.body
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" })
    }
    if (!topic || !topic.trim()) {
      return res.status(400).json({
        success: false,
        message: "Describe the lecture/topic to generate questions for",
      })
    }

    const { error, status, course } = await assertOwnsCourse(courseId, req.user.id)
    if (error) return res.status(status).json({ success: false, message: error })

    const count = Math.min(10, Math.max(1, parseInt(numQuestions, 10) || 5))

    const prompt = `You are helping an instructor create a multiple-choice quiz for their online course "${course.courseName}".
Generate exactly ${count} multiple-choice questions about: ${topic.trim()}
Each question must have exactly 4 options with exactly one correct answer.
Respond with ONLY a JSON array (no markdown fences, no prose before or after), in this exact shape:
[{"questionText": "...", "options": ["...", "...", "...", "..."], "correctOptionIndex": 0}]`

    const text = await callGemini(prompt, { temperature: 0.4, maxOutputTokens: 2048 })

    let questions
    try {
      questions = extractJson(text)
    } catch (parseError) {
      return res.status(502).json({
        success: false,
        message: "Could not parse the AI's response. Try again.",
      })
    }

    const questionError = validateQuestions(questions)
    if (questionError) {
      return res.status(502).json({
        success: false,
        message: `AI generated invalid questions: ${questionError}`,
      })
    }

    return res.status(200).json({ success: true, data: questions })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate quiz draft",
    })
  }
}

// Instructor: list quizzes for a course they own, including correct answers (for editing).
exports.getQuizzesForInstructor = async (req, res) => {
  try {
    const { courseId } = req.query
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" })
    }
    const { error, status } = await assertOwnsCourse(courseId, req.user.id)
    if (error) return res.status(status).json({ success: false, message: error })

    const quizzes = await Quiz.find({ course: courseId }).sort({ createdAt: 1 })
    return res.status(200).json({ success: true, data: quizzes })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch quizzes" })
  }
}

// Instructor: delete a quiz they own.
exports.deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.body
    if (!quizId || !mongoose.isValidObjectId(quizId)) {
      return res.status(400).json({ success: false, message: "Invalid quizId" })
    }
    const quiz = await Quiz.findById(quizId)
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" })

    const { error, status } = await assertOwnsCourse(quiz.course, req.user.id)
    if (error) return res.status(status).json({ success: false, message: error })

    await Quiz.findByIdAndDelete(quizId)
    await QuizAttempt.deleteMany({ quiz: quizId })
    return res.status(200).json({ success: true, message: "Quiz deleted" })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to delete quiz" })
  }
}

// Student: list quizzes for an enrolled course, WITHOUT correct answers, plus
// whether they've already passed each one.
exports.getQuizzesForStudent = async (req, res) => {
  try {
    const { courseId } = req.query
    const userId = req.user.id
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" })
    }

    const course = await Course.findOne({
      _id: courseId,
      studentsEnroled: { $elemMatch: { $eq: userId } },
    })
    if (!course) {
      return res.status(403).json({ success: false, message: "You are not enrolled in this course" })
    }

    const quizzes = await Quiz.find({ course: courseId }).select("-questions.correctOptionIndex")
    const attempts = await QuizAttempt.find({
      user: userId,
      quiz: { $in: quizzes.map((q) => q._id) },
    }).sort({ createdAt: -1 })

    // attempts is sorted most-recent-first; keep the most recent attempt per
    // quiz, but prefer a passed one over a failed one if both exist.
    const bestByQuiz = {}
    for (const a of attempts) {
      const key = a.quiz.toString()
      if (!bestByQuiz[key]) {
        bestByQuiz[key] = a
      } else if (a.passed && !bestByQuiz[key].passed) {
        bestByQuiz[key] = a
      }
    }

    const data = quizzes.map((q) => ({
      ...q.toObject(),
      bestScore: bestByQuiz[q._id.toString()]?.score ?? null,
      passed: bestByQuiz[q._id.toString()]?.passed ?? false,
    }))

    return res.status(200).json({ success: true, data })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch quizzes" })
  }
}

// Student: submit answers, get auto-graded server-side (never trust a client-supplied score).
exports.submitQuizAttempt = async (req, res) => {
  try {
    const { quizId, answers } = req.body
    const userId = req.user.id

    if (!quizId || !mongoose.isValidObjectId(quizId) || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: "Invalid submission" })
    }

    const quiz = await Quiz.findById(quizId)
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" })

    const course = await Course.findOne({
      _id: quiz.course,
      studentsEnroled: { $elemMatch: { $eq: userId } },
    })
    if (!course) {
      return res.status(403).json({ success: false, message: "You are not enrolled in this course" })
    }

    const answerMap = new Map(
      answers
        .filter((a) => a?.question && typeof a.selectedOptionIndex === "number")
        .map((a) => [a.question, a.selectedOptionIndex])
    )

    let correctCount = 0
    for (const q of quiz.questions) {
      if (answerMap.get(q._id.toString()) === q.correctOptionIndex) correctCount++
    }
    const score = Math.round((correctCount / quiz.questions.length) * 100)
    const passed = score >= quiz.passingScore

    const attempt = await QuizAttempt.create({
      quiz: quizId,
      user: userId,
      answers: [...answerMap.entries()].map(([question, selectedOptionIndex]) => ({
        question,
        selectedOptionIndex,
      })),
      score,
      passed,
    })

    let certificate = null
    if (passed) {
      certificate = await checkAndIssueCertificate(userId, quiz.course)
    }

    return res.status(200).json({
      success: true,
      data: { score, passed, passingScore: quiz.passingScore, attemptId: attempt._id },
      certificateIssued: !!certificate,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to submit quiz" })
  }
}
