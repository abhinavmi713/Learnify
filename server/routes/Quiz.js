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
const { auth, requirePermission } = require("../middleware/auth")
const { quizIdSchema } = require("../validators/miscValidators")
const { aiLimiter } = require("../middleware/rateLimiter")
const { validate } = require("../middleware/validate")
const {
  createQuizSchema,
  generateQuizDraftSchema,
  submitQuizSchema,
} = require("../validators/quizValidators")

router.post("/create", auth, requirePermission("quiz:author"), validate(createQuizSchema), createQuiz)
router.post(
  "/generate-draft",
  auth,
  requirePermission("quiz:author"),
  aiLimiter,
  validate(generateQuizDraftSchema),
  generateQuizDraft
)
router.get("/instructor", auth, requirePermission("quiz:author"), getQuizzesForInstructor)
router.post("/delete", auth, requirePermission("quiz:author"), validate(quizIdSchema), deleteQuiz)
router.get("/student", auth, requirePermission("course:learn"), getQuizzesForStudent)
router.post("/submit", auth, requirePermission("course:learn"), validate(submitQuizSchema), submitQuizAttempt)

module.exports = router
