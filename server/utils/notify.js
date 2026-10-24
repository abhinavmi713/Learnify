const Notification = require("../models/Notification")
const { emitToUser } = require("../realtime")

// Fire-and-forget in-app notification. Failures here should never break the
// caller's main flow (e.g. approving a course should succeed even if the
// notification write fails), so errors are logged, not thrown.
exports.notifyUser = async (userId, message, link) => {
  try {
    const notification = await Notification.create({ user: userId, message, link })
    // Push it to the user's open tabs immediately (the bell no longer waits for
    // its next poll). Works from the API and, via Redis, from the worker.
    emitToUser(String(userId), "notification:new", notification.toObject())
  } catch (error) {
    console.error("Failed to create notification:", error.message)
  }
}
