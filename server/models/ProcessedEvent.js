const mongoose = require("mongoose")

// Consumer-side idempotency. A message can be delivered more than once
// (at-least-once delivery: redelivery after a crash, or the outbox relay
// republishing). Each consumer records the events it has finished so a repeat
// is acknowledged without running its side effect (e.g. a second email) again.
const processedEventSchema = new mongoose.Schema({
  consumer: { type: String, required: true },
  eventId: { type: String, required: true },
  processedAt: { type: Date, default: Date.now, expires: 14 * 24 * 3600 },
})

processedEventSchema.index({ consumer: 1, eventId: 1 }, { unique: true })

module.exports = mongoose.model("ProcessedEvent", processedEventSchema)
