const mongoose = require("mongoose")

const learningPathSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // Ordered — the sequence a student is meant to take these courses in.
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
  },
  { timestamps: true }
)

module.exports = mongoose.model("LearningPath", learningPathSchema)
