const { v4: uuidv4 } = require("uuid")
const OutboxEvent = require("../models/OutboxEvent")
const { SENSITIVE } = require("./types")
const { captureTraceContext } = require("../utils/traceContext")

// Records an event to be published. Pass the `session` of the transaction that
// makes the business change so both commit together or not at all:
//
//   await runInTransaction(async (session) => {
//     await Order.create([...], { session })
//     await enqueueEvent(EVENTS.ORDER_PAID, { ... }, { session })
//   })
//
// Without a session the event is still durably recorded (and published later),
// which is the right choice for "tell someone" side effects that have no
// accompanying database change.
async function enqueueEvent(type, payload, { session } = {}) {
  const doc = {
    eventId: uuidv4(),
    type,
    payload,
    sensitive: SENSITIVE.has(type),
    traceContext: captureTraceContext(),
  }
  const [created] = await OutboxEvent.create([doc], session ? { session } : {})
  return created
}

module.exports = { enqueueEvent }
