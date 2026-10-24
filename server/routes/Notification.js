const express = require("express")
const router = express.Router()

const {
  getMyNotifications,
  markNotificationRead,
  markAllRead,
} = require("../controllers/Notification")
const { auth } = require("../middleware/auth")
const { validate } = require("../middleware/validate")
const { notificationIdSchema } = require("../validators/miscValidators")

router.get("/mine", auth, getMyNotifications)
router.post("/mark-read", auth, validate(notificationIdSchema), markNotificationRead)
router.post("/mark-all-read", auth, markAllRead)

module.exports = router
