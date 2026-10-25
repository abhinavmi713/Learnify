const amqp = require("amqplib")
const logger = require("./logger")

// Subscribes this service to course content changes on the shared event bus.
//
// Follows the same conventions as the main worker (topic exchange
// learnify.events, delayed retries through learnify.retry -> learnify.work,
// <queue>.dlq after the last attempt) without sharing code with it: services
// agree on the contract, not on a library.
const EVENTS = "learnify.events"
const WORK = "learnify.work"
const RETRY = "learnify.retry"
const QUEUE = "ai-indexer"
const BINDINGS = ["course.content_changed"]
const DELAYS = [5000, 30000, 120000]

function publish(channel, exchange, key, content, options) {
  return new Promise((resolve, reject) => channel.publish(exchange, key, content, options, (e) => (e ? reject(e) : resolve())))
}

async function startConsumer({ url, onCourseChanged }) {
  let connection
  let stopped = false
  let attempt = 0

  async function connect() {
    try {
      connection = await amqp.connect(url, { heartbeat: 30 })
      connection.on("error", (e) => logger.warn({ err: e.message }, "rabbitmq error"))
      connection.on("close", () => {
        if (!stopped) setTimeout(connect, Math.min(10000, 500 * 2 ** Math.min(++attempt, 5))).unref()
      })
      const channel = await connection.createConfirmChannel()
      await channel.assertExchange(EVENTS, "topic", { durable: true })
      await channel.assertExchange(WORK, "direct", { durable: true })
      await channel.assertExchange(RETRY, "direct", { durable: true })
      await channel.assertQueue(QUEUE, { durable: true })
      await channel.assertQueue(`${QUEUE}.dlq`, { durable: true })
      await channel.bindQueue(QUEUE, WORK, QUEUE)
      for (const key of BINDINGS) await channel.bindQueue(QUEUE, EVENTS, key)
      for (let i = 0; i < DELAYS.length; i++) {
        const q = `${QUEUE}.retry.${i + 1}`
        await channel.assertQueue(q, {
          durable: true,
          arguments: { "x-message-ttl": DELAYS[i], "x-dead-letter-exchange": WORK, "x-dead-letter-routing-key": QUEUE },
        })
        await channel.bindQueue(q, RETRY, `${QUEUE}.${i + 1}`)
      }
      // Embedding calls are slow and rate-limited; index a couple of courses at a time.
      await channel.prefetch(2)

      await channel.consume(QUEUE, async (msg) => {
        if (!msg) return
        const headers = msg.properties.headers || {}
        let event
        try {
          event = JSON.parse(msg.content.toString())
        } catch {
          await publish(channel, "", `${QUEUE}.dlq`, msg.content, { persistent: true, headers })
          return channel.ack(msg)
        }
        try {
          await onCourseChanged(event.payload.courseId, event)
          channel.ack(msg)
        } catch (error) {
          const attempts = (Number(headers["x-attempts"]) || 0) + 1
          const options = { persistent: true, headers: { ...headers, "x-attempts": attempts, "x-last-error": String(error.message).slice(0, 200) } }
          try {
            if (attempts <= DELAYS.length) await publish(channel, RETRY, `${QUEUE}.${attempts}`, msg.content, options)
            else await publish(channel, "", `${QUEUE}.dlq`, msg.content, options)
            channel.ack(msg)
          } catch {
            channel.nack(msg, false, true)
          }
          logger.warn({ courseId: event?.payload?.courseId, attempts, err: error.message }, "indexing failed")
        }
      })
      attempt = 0
      logger.info({ queue: QUEUE, bindings: BINDINGS }, "consuming course events")
    } catch (error) {
      logger.warn({ err: error.message }, "rabbitmq unavailable; retrying")
      if (!stopped) setTimeout(connect, Math.min(10000, 500 * 2 ** Math.min(++attempt, 5))).unref()
    }
  }

  await connect()
  return {
    isConnected: () => Boolean(connection),
    stop: async () => {
      stopped = true
      if (connection) await connection.close().catch(() => {})
    },
  }
}

module.exports = { startConsumer, QUEUE }
