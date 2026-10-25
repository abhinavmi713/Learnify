const mongoose = require("mongoose")

// An instructor's subscription: POST these events to this URL, signed with a
// secret only the instructor and Learnify know.
const webhookSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    url: { type: String, required: true, maxlength: 2000 },
    description: { type: String, default: "", maxlength: 200 },
    events: { type: [String], required: true },
    // Signing secret, AES-256-GCM encrypted (utils/secretBox.js): it must be
    // recoverable to sign requests, so it cannot be hashed like a password.
    secret: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    // Consecutive failed deliveries; the subscription is paused at a threshold.
    consecutiveFailures: { type: Number, default: 0 },
    disabledReason: { type: String, default: null },
    lastDeliveryAt: { type: Date, default: null },
  },
  { timestamps: true }
)

webhookSchema.index({ owner: 1, active: 1 })

module.exports = mongoose.model("Webhook", webhookSchema)
