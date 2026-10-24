const amqp = require("amqplib")
const logger = require("../utils/logger")
const { registerCheck } = require("../utils/health")

// RabbitMQ connection, topology and consumer runtime.
//
// Topology
//   learnify.events  (topic)   producers publish here with routing key = event type
//   learnify.work    (direct)  retried messages come back through here, routing key = queue name
//   learnify.retry   (direct)  failed messages are parked here for a delay
//
//   <queue>             durable work queue, bound to learnify.events (per binding key)
//                       and to learnify.work (key = queue name)
//   <queue>.retry.N     holds a failed message for delays[N-1] ms (message TTL), then
//                       dead-letters it back to learnify.work -> <queue>
//   <queue>.dlq         where a message ends up after the last attempt (inspect/replay by hand)
//
// A handler that throws gets its message re-queued with exponential-ish delays
// instead of being redelivered instantly (which would hot-loop a poison message
// and starve the queue); after the last attempt it is parked in the DLQ.
const EVENTS_EXCHANGE = "learnify.events"
const WORK_EXCHANGE = "learnify.work"
const RETRY_EXCHANGE = "learnify.retry"
const DEFAULT_RETRY_DELAYS = [5000, 30000, 120000]

let connection = null
let publishChannel = null
let connecting = false
let closing = false
let reconnectTimer = null
let attempt = 0
const consumers = new Map() // name -> definition (re-established after a reconnect)

const isConfigured = () => Boolean(process.env.RABBITMQ_URL)
const isConnected = () => Boolean(connection && publishChannel)

function promisePublish(channel, exchange, routingKey, content, options) {
  return new Promise((resolve, reject) => {
    // With a confirm channel the callback fires once the broker has taken
    // responsibility for the message (persisted for durable queues).
    channel.publish(exchange, routingKey, content, options, (err) => (err ? reject(err) : resolve()))
  })
}

async function assertSharedTopology(channel) {
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true })
  await channel.assertExchange(WORK_EXCHANGE, "direct", { durable: true })
  await channel.assertExchange(RETRY_EXCHANGE, "direct", { durable: true })
}

async function assertQueueTopology(channel, def) {
  const delays = def.retryDelaysMs || DEFAULT_RETRY_DELAYS
  await channel.assertQueue(def.name, { durable: true })
  await channel.assertQueue(`${def.name}.dlq`, { durable: true })
  await channel.bindQueue(def.name, WORK_EXCHANGE, def.name)
  for (const key of def.bindings) await channel.bindQueue(def.name, EVENTS_EXCHANGE, key)

  for (let i = 0; i < delays.length; i++) {
    const retryQueue = `${def.name}.retry.${i + 1}`
    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: {
        "x-message-ttl": delays[i],
        "x-dead-letter-exchange": WORK_EXCHANGE,
        "x-dead-letter-routing-key": def.name,
      },
    })
    await channel.bindQueue(retryQueue, RETRY_EXCHANGE, `${def.name}.${i + 1}`)
  }
}

async function startConsumer(def) {
  const delays = def.retryDelaysMs || DEFAULT_RETRY_DELAYS
  const maxAttempts = delays.length + 1
  const channel = await connection.createConfirmChannel()
  channel.on("error", (error) => logger.warn({ queue: def.name, err: error.message }, "consumer channel error"))
  await assertSharedTopology(channel)
  await assertQueueTopology(channel, def)
  await channel.prefetch(def.prefetch || 10)

  await channel.consume(def.name, async (msg) => {
    if (!msg) return // cancelled by the broker
    const headers = msg.properties.headers || {}

    let event
    try {
      event = JSON.parse(msg.content.toString())
    } catch (error) {
      // Not JSON: retrying cannot fix it. Park it for a human.
      await promisePublish(channel, "", `${def.name}.dlq`, msg.content, {
        persistent: true,
        headers: { ...headers, "x-last-error": "unparseable message" },
      })
      channel.ack(msg)
      return
    }

    try {
      await def.handler(event)
      channel.ack(msg)
    } catch (error) {
      const attempts = (Number(headers["x-attempts"]) || 0) + 1
      const nextHeaders = { ...headers, "x-attempts": attempts, "x-last-error": String(error.message).slice(0, 200) }
      const options = {
        persistent: true,
        contentType: "application/json",
        messageId: msg.properties.messageId,
        type: msg.properties.type,
        headers: nextHeaders,
      }
      try {
        if (attempts < maxAttempts) {
          logger.warn({ queue: def.name, eventId: event.id, attempts, err: error.message }, "handler failed; scheduling retry")
          await promisePublish(channel, RETRY_EXCHANGE, `${def.name}.${attempts}`, msg.content, options)
        } else {
          logger.error({ queue: def.name, eventId: event.id, attempts, err: error.message }, "handler failed; moved to DLQ")
          await promisePublish(channel, "", `${def.name}.dlq`, msg.content, options)
        }
        channel.ack(msg)
      } catch (publishError) {
        // Could not park it either: put it back so it is not lost.
        channel.nack(msg, false, true)
      }
    }
  })
  def.channel = channel
  logger.info({ queue: def.name, bindings: def.bindings }, "consumer started")
}

async function connectOnce() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL, { heartbeat: 30 })
  conn.on("error", (error) => logger.warn({ err: error.message }, "rabbitmq connection error"))
  conn.on("close", () => {
    if (connection === conn) {
      connection = null
      publishChannel = null
    }
    if (!closing) {
      logger.warn("rabbitmq connection closed; reconnecting")
      scheduleReconnect()
    }
  })
  connection = conn

  const channel = await conn.createConfirmChannel()
  channel.on("error", (error) => logger.warn({ err: error.message }, "publish channel error"))
  await assertSharedTopology(channel)
  publishChannel = channel

  for (const def of consumers.values()) await startConsumer(def)
  logger.info("rabbitmq connected")
}

function scheduleReconnect() {
  if (closing || reconnectTimer || !isConfigured()) return
  attempt++
  const delay = Math.min(10000, 500 * 2 ** Math.min(attempt, 5))
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
  reconnectTimer.unref?.()
}

// Connects in the background and keeps reconnecting. Never throws: the app starts
// and serves traffic even if the broker is down (events wait in the outbox).
async function connect() {
  if (!isConfigured() || connecting || isConnected()) return
  connecting = true
  try {
    await connectOnce()
    attempt = 0
  } catch (error) {
    logger.warn({ err: error.message }, "rabbitmq unavailable; will retry")
    scheduleReconnect()
  } finally {
    connecting = false
  }
}

let healthRegistered = false
function start() {
  if (!isConfigured()) return
  if (!healthRegistered) {
    registerCheck(
      "rabbitmq",
      () => {
        if (!isConnected()) throw new Error("not connected")
      },
      { critical: false }
    )
    healthRegistered = true
  }
  connect()
}

// Publishes one event and resolves only after the broker confirms it.
async function publishEvent(event) {
  if (!isConnected()) throw new Error("rabbitmq not connected")
  await promisePublish(publishChannel, EVENTS_EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    contentType: "application/json",
    messageId: event.id,
    type: event.type,
    timestamp: Math.floor(Date.now() / 1000),
  })
}

// def: { name, bindings: [eventType], handler(event), retryDelaysMs?, prefetch? }
async function registerConsumer(def) {
  consumers.set(def.name, def)
  if (isConnected()) await startConsumer(def)
}

async function close() {
  closing = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  try {
    if (publishChannel) await publishChannel.close()
    for (const def of consumers.values()) if (def.channel) await def.channel.close().catch(() => {})
    if (connection) await connection.close()
  } catch (error) {
    /* already closed */
  }
  connection = null
  publishChannel = null
  consumers.clear()
  closing = false
}

module.exports = {
  isConfigured,
  isConnected,
  start,
  publishEvent,
  registerConsumer,
  close,
  EVENTS_EXCHANGE,
  WORK_EXCHANGE,
  RETRY_EXCHANGE,
}
