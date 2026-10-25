const mongoose = require("mongoose")

const courseProgress = new mongoose.Schema({
  courseID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  completedVideos: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubSection",
    },
  ],
  // Last playback position (in seconds) the student reached in each subsection,
  // so the player can resume where they left off instead of always starting at 0.
  lastWatchedPositions: [
    {
      subsection: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubSection",
      },
      position: {
        type: Number,
        default: 0,
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
}, { timestamps: true })

// Every lookup filters by these two together (one progress doc per student
// per course) — indexing the pair also makes it impossible to accidentally
// create two progress docs for the same enrollment.
courseProgress.index({ courseID: 1, userId: 1 }, { unique: true })
// "All of one student's progress" (profile stats): the index above starts with
// courseID, so it cannot serve a query on userId alone.
courseProgress.index({ userId: 1 })

module.exports = mongoose.model("courseProgress", courseProgress)
