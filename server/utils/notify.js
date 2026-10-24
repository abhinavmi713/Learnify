const Notification = require("../models/Notification")

// Fire-and-forget in-app notification. Failures here should never break the
// caller's main flow (e.g. approving a course should succeed even if the
// notification write fails), so errors are logged, not thrown.
exports.notifyUser = async (userId, message, link) => {
  try {
    await Notification.create({ user: userId, message, link })
  } catch (error) {
    console.error("Failed to create notification:", error.message)
  }
}
