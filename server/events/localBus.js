const { consumers } = require("../workers/consumers")
const { processEvent } = require("../workers/runner")

// In-process stand-in for RabbitMQ, used only when RABBITMQ_URL is not set.
// Runs every consumer bound to the event type, through the same idempotent
// runner a real worker uses. If a consumer throws, dispatch throws and the
// outbox relay retries the event with backoff; consumers that already succeeded
// skip themselves on the repeat (idempotency), so only the failed one runs again.
async function dispatch(event) {
  const targets = consumers.filter((c) => c.bindings.includes(event.type))
  for (const consumer of targets) {
    await processEvent(consumer, event)
  }
}

module.exports = { dispatch }
