const Notification = require("../models/Notification")

exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(30)

    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      read: false,
    })

    return res.status(200).json({ success: true, data: notifications, unreadCount })
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
