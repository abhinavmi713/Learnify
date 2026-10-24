const mongoose = require("mongoose")

const noteSchema = new mongoose.Schema(
  {
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
    subsection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubSection",
      required: true,
      index: true,
    },
    // Playback position, in seconds, this note is anchored to.
    timestamp: {
      type: Number,
      required: true,
      min: 0,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model("Note", noteSchema)
