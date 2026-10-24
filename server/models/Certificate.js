const mongoose = require("mongoose")

const certificateSchema = new mongoose.Schema(
  {
    certificateId: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
)

// One certificate per (user, course) pair.
certificateSchema.index({ user: 1, course: 1 }, { unique: true })

module.exports = mongoose.model("Certificate", certificateSchema)
