const mongoose = require("mongoose")

const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    answers: [
      {
        question: { type: mongoose.Schema.Types.ObjectId, required: true },
        selectedOptionIndex: { type: Number, required: true },
      },
    ],
    score: {
      type: Number, // percentage, 0-100
      required: true,
    },
    passed: {
      type: Boolean,
      required: true,
    },
  },
  { timestamps: true }
)

// `quiz` and `user` are each already indexed individually, but the actual
// query shape everywhere in this app (getQuizzesForStudent's best-attempt
// lookup, badge/certificate checks) filters on both at once — a compound
// index serves that directly instead of intersecting two single-field ones.
quizAttemptSchema.index({ user: 1, quiz: 1 })

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema)
