const { withTraceContext } = require("../utils/traceContext")
const { eventsPublished } = require("../utils/metrics")
const OutboxEvent = require("../models/OutboxEvent")
const { publish } = require("./publisher")
const logger = require("../utils/logger")

// Outbox relay: moves rows from the `outboxevents` collection to the broker.
//
// Safe to run in several processes at once. A row is claimed with an atomic
// findOneAndUpdate (pending -> publishing), so two relays never take the same
// row; a relay that dies mid-publish leaves a `publishing` row whose lock goes
// stale and is reclaimed. Publishing then retries with exponential backoff, and
// a row is only marked `sent` after the broker confirms it.
const POLL_MS = 500
const STALE_LOCK_MS = 30000
const MAX_ATTEMPTS = 25

let timer = null
let running = false

function backoffMs(attempts) {
  return Math.min(60000, 1000 * 2 ** Math.min(attempts, 6))
}

async function claimNext() {
  const now = new Date()
  return OutboxEvent.findOneAndUpdate(
    {
      $or: [
        { status: "pending", nextAttemptAt: { $lte: now } },
        { status: "publishing", lockedAt: { $lte: new Date(now.getTime() - STALE_LOCK_MS) } },
      ],
    },
    { $set: { status: "publishing", lockedAt: now }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true }
  )
}

async function publishOne(doc) {
  const event = { id: doc.eventId, type: doc.type, payload: doc.payload, occurredAt: doc.createdAt }
  try {
    // Publish inside the originating request's trace, so the broker hop and the
    // consumer show up under the same trace id.
    await withTraceContext(doc.traceContext, () => publish(event))
    const update = { status: "sent", sentAt: new Date(), lockedAt: null, lastError: null }
    // A delivered OTP or reset link has no reason to stay in the database.
    if (doc.sensitive) update.payload = { redacted: true }
    await OutboxEvent.updateOne({ _id: doc._id }, { $set: update })
    eventsPublished.inc({ type: doc.type, outcome: "success" })
    return true
  } catch (error) {
    const exhausted = doc.attempts >= MAX_ATTEMPTS
    await OutboxEvent.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: exhausted ? "failed" : "pending",
          lockedAt: null,
          lastError: String(error.message).slice(0, 300),
          nextAttemptAt: new Date(Date.now() + backoffMs(doc.attempts)),
        },
      }
    )
    eventsPublished.inc({ type: doc.type, outcome: "failure" })
    logger.warn({ eventId: doc.eventId, type: doc.type, attempts: doc.attempts, err: error.message }, "outbox publish failed")
    return false
  }
}

// Publishes everything currently due. Returns how many rows were delivered.
async function drain({ max = 200 } = {}) {
  let delivered = 0
  for (let i = 0; i < max; i++) {
    const doc = await claimNext()
    if (!doc) break
    if (await publishOne(doc)) delivered++
  }
  return delivered
}

async function tick() {
  if (running) return
  running = true
  try {
    await drain()
  } catch (error) {
    logger.error({ err: error.message }, "outbox relay tick failed")
  } finally {
    running = false
  }
}

function startRelay(intervalMs = POLL_MS) {
  if (timer) return
  timer = setInterval(tick, intervalMs)
  timer.unref?.()
  logger.info("outbox relay started")
}

function stopRelay() {
  if (timer) clearInterval(timer)
  timer = null
}

// How many events are waiting (for /health and metrics).
async function backlog() {
  return OutboxEvent.countDocuments({ status: { $in: ["pending", "publishing"] } })
}

module.exports = { startRelay, stopRelay, drain, backlog, backoffMs }
