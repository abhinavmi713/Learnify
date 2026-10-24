const mongoose = require("mongoose")

const questionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: true,
    trim: true,
  },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: (arr) => arr.length >= 2 && arr.length <= 6,
      message: "A question needs between 2 and 6 options",
    },
  },
  correctOptionIndex: {
    type: Number,
    required: true,
    min: 0,
  },
})

const quizSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // Percentage (0-100) of correct answers required to pass.
    passingScore: {
      type: Number,
      default: 70,
      min: 1,
      max: 100,
    },
    questions: [questionSchema],
  },
  { timestamps: true }
)

module.exports = mongoose.model("Quiz", quizSchema)
