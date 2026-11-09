const mongoose = require("mongoose")

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
      // Indexed through the compound indexes below (user is their prefix).
    },
    message: {
      type: String,
      required: true,
    },
    link: {
      type: String,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
)

// Feed (newest first) and unread badge for one user.
// _id breaks ties in the feed's sort, so it must be in the index.
notificationSchema.index({ user: 1, createdAt: -1, _id: -1 })
notificationSchema.index({ user: 1, read: 1 })

module.exports = mongoose.model("Notification", notificationSchema)
