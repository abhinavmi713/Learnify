const rabbit = require("../config/rabbit")
const localBus = require("./localBus")

// Where the outbox relay sends events.
//   RABBITMQ_URL set  -> RabbitMQ. If the broker is down this THROWS, so the relay
//                        keeps the event pending and retries; it is never also
//                        handled locally (that would double-process it later).
//   RABBITMQ_URL unset -> in-process bus: the same consumers run inside this
//                        process. Lets the app and the tests work without Docker.
async function publish(event) {
  if (rabbit.isConfigured()) return rabbit.publishEvent(event)
  return localBus.dispatch(event)
}

module.exports = { publish }
