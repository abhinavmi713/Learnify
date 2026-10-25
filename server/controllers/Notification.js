const Notification = require("../models/Notification")

const mongoose = require("mongoose")

// Cursor = "<createdAt ms>_<id>" of the last item seen. Keyset pagination: each
// page is an index range scan on {user, createdAt} however far back you go, and
// new notifications arriving meanwhile do not shift or repeat items (which
// skip/limit would). The id breaks ties between equal timestamps.
const encodeCursor = (n) => `${new Date(n.createdAt).getTime()}_${n._id}`
function decodeCursor(raw) {
  const [ms, id] = String(raw || "").split("_")
  if (!/^\d+$/.test(ms || "") || !mongoose.isValidObjectId(id)) return null
  return { at: new Date(Number(ms)), id: new mongoose.Types.ObjectId(id) }
}

exports.getMyNotifications = async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30))
    const filter = { user: req.user.id }
    if (req.query.before) {
      const cursor = decodeCursor(req.query.before)
      if (!cursor) return res.status(400).json({ success: false, message: "Invalid cursor" })
      filter.$or = [{ createdAt: { $lt: cursor.at } }, { createdAt: cursor.at, _id: { $lt: cursor.id } }]
    }

    const rows = await Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1)
    const hasMore = rows.length > limit
    const notifications = rows.slice(0, limit)

    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      read: false,
    })

    return res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      nextCursor: hasMore ? encodeCursor(notifications[notifications.length - 1]) : null,
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

exports.markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.body
    const notification = await Notification.findOne({
      _id: notificationId,
      user: req.user.id,
    })

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" })
    }

    notification.read = true
    await notification.save()

    return res.status(200).json({ success: true, message: "Marked as read" })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user.id, read: false }, { read: true })
    return res.status(200).json({ success: true, message: "All notifications marked as read" })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}
