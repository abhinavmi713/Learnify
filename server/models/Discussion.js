const mongoose = require("mongoose")

const discussionSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    subsection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubSection",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    // null for a top-level question; set to the question's _id for a reply.
    // Kept one level deep (no nested replies-to-replies) to keep the thread
    // UI simple.
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Discussion",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model("Discussion", discussionSchema)
