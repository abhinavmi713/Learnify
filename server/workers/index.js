// Background worker process:  npm run worker
//
// Consumes events from RabbitMQ and performs the slow or failure-prone work the
// API deliberately does not do inside a request (sending email, refunds).
// Scale it independently of the API by running more copies; RabbitMQ spreads
// messages across them and the idempotent runner makes redelivery harmless.
require("../tracing").startTracing("learnify-worker")
require("dotenv").config()

const http = require("http")
const mongoose = require("mongoose")
const { validateEnv } = require("../config/env")
validateEnv()

const database = require("../config/database")
const rabbit = require("../config/rabbit")
const { closeRedis, redisConfigured } = require("../config/redis")
const relay = require("../events/relay")
const logger = require("../utils/logger")
const { consumers } = require("./consumers")
const { processEvent } = require("./runner")

// Registers every consumer with the broker. Also used by the API when it is
// told to host the worker itself (RUN_WORKER_IN_API) for simple local setups.
async function startConsumers() {
  rabbit.start()
  for (const consumer of consumers) {
    await rabbit.registerConsumer({
      ...consumer,
      handler: (event, meta) => processEvent(consumer, event, meta),
    })
  }
}

// The worker has no HTTP API, so Prometheus scrapes it on its own port.
function startMetricsServer() {
  const port = Number(process.env.WORKER_METRICS_PORT || 9464)
  if (!port) return null
  const { register } = require("../utils/metrics")
  const server = http.createServer(async (req, res) => {
    if (req.url !== "/metrics") {
      res.statusCode = 404
      return res.end()
    }
    res.setHeader("Content-Type", register.contentType)
    res.end(await register.metrics())
  })
  server.on("error", (error) => logger.warn({ err: error.message, port }, "worker metrics server unavailable"))
  server.listen(port, () => logger.info({ port }, "worker metrics on /metrics"))
  return server
}

async function main() {
  if (!rabbit.isConfigured()) {
    logger.error("RABBITMQ_URL is not set; there is nothing for the worker to consume")
    process.exit(1)
  }
  database.connect()
  redisConfigured()
  require("../search/courseIndex").bootstrapSearch()
  await startConsumers()
  // Also publish pending outbox rows, so events still flow if the API is down.
  if (process.env.OUTBOX_RELAY !== "0") relay.startRelay()
  const metricsServer = startMetricsServer()
  logger.info("worker running")

  let stopping = false
  const stop = async (signal) => {
    if (stopping) return
    stopping = true
    logger.info({ signal }, "worker shutting down")
    setTimeout(() => process.exit(1), 10000).unref()
    relay.stopRelay()
    metricsServer?.close()
    await rabbit.close()
    await mongoose.disconnect()
    await closeRedis()
    process.exit(0)
  }
  process.on("SIGTERM", () => stop("SIGTERM"))
  process.on("SIGINT", () => stop("SIGINT"))
}

if (require.main === module) {
  main().catch((error) => {
    logger.error({ err: error.message }, "worker failed to start")
    process.exit(1)
  })
}

module.exports = { startConsumers }
