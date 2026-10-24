const mongoose = require("mongoose")

// Transactional outbox.
//
// Writing business data and then publishing to a message broker are two
// separate systems, so a crash between them loses the event ("dual write"
// problem): the order is saved but the confirmation email is never queued.
// Instead, the event row is written in the SAME database transaction as the
// business change. A relay (events/relay.js) later publishes pending rows to
// RabbitMQ and marks them sent, retrying until the broker accepts them.
// Delivery is therefore at-least-once; consumers are idempotent.
const outboxEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Payloads holding secrets (OTP, reset links) are wiped once delivered.
    sensitive: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "publishing", "sent", "failed"], default: "pending" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lockedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
)

// The relay's claim query.
outboxEventSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 })
// Delivered events are only kept for a while (audit/debugging), then removed.
outboxEventSchema.index({ sentAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 })

module.exports = mongoose.model("OutboxEvent", outboxEventSchema)
