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
const { idParamSchema, deliveryIdParamSchema } = require("../validators/miscValidators")

// Instructor webhooks: signed HTTP callbacks for enrollments, reviews and
// course moderation (utils/webhooks.js documents the contract).
router.use(auth, requirePermission("webhook:manage"))

router.get("/events", listEvents)
router.get("/", listWebhooks)
router.post("/", validate(createWebhookSchema), createWebhook)
router.post("/:id/update", validate(idParamSchema, "params"), validate(updateWebhookSchema), updateWebhook)
router.post("/:id/rotate-secret", validate(idParamSchema, "params"), rotateSecret)
router.post("/:id/test", validate(idParamSchema, "params"), testWebhook)
router.delete("/:id", validate(idParamSchema, "params"), deleteWebhook)
router.get("/:id/deliveries", validate(idParamSchema, "params"), listDeliveries)
router.post("/deliveries/:deliveryId/redeliver", validate(deliveryIdParamSchema, "params"), redeliver)

module.exports = router
