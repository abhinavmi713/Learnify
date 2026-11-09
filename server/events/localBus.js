const { consumers } = require("../workers/consumers")
const { processEvent } = require("../workers/runner")

// In-process stand-in for RabbitMQ, used only when RABBITMQ_URL is not set.
// Runs every consumer bound to the event type, through the same idempotent
// runner a real worker uses. If a consumer throws, dispatch throws and the
// outbox relay retries the event with backoff; consumers that already succeeded
// skip themselves on the repeat (idempotency), so only the failed one runs again.
// Consumers run side by side, so a slow one doesn't delay the others; if any
// fails, dispatch throws and only the failed ones run again on the retry.
async function dispatch(event, meta = {}) {
  const targets = consumers.filter((c) => c.bindings.includes(event.type))
  const results = await Promise.allSettled(targets.map((consumer) => processEvent(consumer, event, meta)))
  const failed = results.find((r) => r.status === "rejected")
  if (failed) throw failed.reason
}

module.exports = { dispatch }
