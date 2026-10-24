const express = require("express")
const router = express.Router()

const {
  createQuiz,
  generateQuizDraft,
  getQuizzesForInstructor,
  deleteQuiz,
  getQuizzesForStudent,
  submitQuizAttempt,
} = require("../controllers/Quiz")
const { auth, isInstructor, isStudent } = require("../middleware/auth")
const { quizIdSchema } = require("../validators/miscValidators")
const { aiLimiter } = require("../middleware/rateLimiter")
const { validate } = require("../middleware/validate")
const {
  createQuizSchema,
  generateQuizDraftSchema,
  submitQuizSchema,
} = require("../validators/quizValidators")

router.post("/create", auth, isInstructor, validate(createQuizSchema), createQuiz)
router.post(
  "/generate-draft",
  auth,
  isInstructor,
  aiLimiter,
  validate(generateQuizDraftSchema),
  generateQuizDraft
)
router.get("/instructor", auth, isInstructor, getQuizzesForInstructor)
router.post("/delete", auth, isInstructor, validate(quizIdSchema), deleteQuiz)
router.get("/student", auth, isStudent, getQuizzesForStudent)
router.post("/submit", auth, isStudent, validate(submitQuizSchema), submitQuizAttempt)

module.exports = router
