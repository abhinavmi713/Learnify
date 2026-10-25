const express = require("express")
const router = express.Router()

const {
  listEvents,
  listWebhooks,
  createWebhook,
  updateWebhook,
  rotateSecret,
  deleteWebhook,
  testWebhook,
  listDeliveries,
  redeliver,
} = require("../controllers/Webhooks")
const { auth, requirePermission } = require("../middleware/auth")
const { validate } = require("../middleware/validate")
const { createWebhookSchema, updateWebhookSchema } = require("../validators/webhookValidators")

// Instructor webhooks: signed HTTP callbacks for enrollments, reviews and
// course moderation (utils/webhooks.js documents the contract).
router.use(auth, requirePermission("webhook:manage"))

router.get("/events", listEvents)
router.get("/", listWebhooks)
router.post("/", validate(createWebhookSchema), createWebhook)
router.post("/:id/update", validate(updateWebhookSchema), updateWebhook)
router.post("/:id/rotate-secret", rotateSecret)
router.post("/:id/test", testWebhook)
router.delete("/:id", deleteWebhook)
router.get("/:id/deliveries", listDeliveries)
router.post("/deliveries/:deliveryId/redeliver", redeliver)

module.exports = router
