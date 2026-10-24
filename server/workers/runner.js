const ProcessedEvent = require("../models/ProcessedEvent")

// Runs one consumer's handler for one event, exactly-once in effect.
//
// The broker (and the outbox relay) deliver at-least-once, so the same event can
// arrive twice. We remember (consumer, eventId) once the handler has SUCCEEDED
// and skip repeats. The marker is written after the handler, not before: written
// first, a crash mid-handler would make the retry think the work was done and
// the email would never be sent. The cost is a small window where a crash right
// after the handler (before the marker) repeats the side effect on redelivery;
// for an email that is an acceptable duplicate, and the handlers are written so
// repeats are harmless where it matters (e.g. a refund checks its own status).
async function processEvent(consumer, event) {
  const done = await ProcessedEvent.exists({ consumer: consumer.name, eventId: event.id })
  if (done) return { skipped: true }

  await consumer.handler(event)

  try {
    await ProcessedEvent.create({ consumer: consumer.name, eventId: event.id })
  } catch (error) {
    // A concurrent delivery finished first; nothing to do.
    if (error.code !== 11000) throw error
  }
  return { skipped: false }
}

module.exports = { processEvent }
