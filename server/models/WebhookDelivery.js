const mongoose = require("mongoose")

// One event sent (or being sent) to one webhook. The id is sent as the
// Learnify-Delivery header, so receivers can ignore duplicates.
const webhookDeliverySchema = new mongoose.Schema(
  {
    webhook: { type: mongoose.Schema.Types.ObjectId, ref: "Webhook", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    event: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    // "<domain event id>:<webhook event>:<course>", unique per webhook: fan-out
    // can run again after a crash without creating duplicate deliveries.
    sourceEventId: { type: String, default: null },
    status: { type: String, enum: ["pending", "succeeded", "failed"], default: "pending" },
    attempts: { type: Number, default: 0 },
    responseStatus: { type: Number, default: null },
    responseBody: { type: String, default: "" },
    durationMs: { type: Number, default: null },
    error: { type: String, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
)

webhookDeliverySchema.index({ webhook: 1, createdAt: -1 })
webhookDeliverySchema.index(
  { webhook: 1, sourceEventId: 1 },
  { unique: true, partialFilterExpression: { sourceEventId: { $type: "string" } } }
)
// Delivery history is kept for 30 days.
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 })

module.exports = mongoose.model("WebhookDelivery", webhookDeliverySchema)
