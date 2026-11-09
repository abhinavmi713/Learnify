const fs = require("fs")
const os = require("os")
const path = require("path")
const mongoose = require("mongoose")
const rabbit = require("../config/rabbit")
const logger = require("../utils/logger")

// The worker serves no HTTP API, so it reports its health two ways:
//   - a heartbeat file, refreshed while it is connected to MongoDB and RabbitMQ,
//     which the container health check reads (scripts/healthcheck.js); this works
//     even where no port can be opened, such as a Render background worker
//   - GET /health on the metrics port, when one is configured
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE || path.join(os.tmpdir(), "learnify-worker-health.json")
const HEARTBEAT_MS = 15 * 1000

function workerHealth() {
  const mongo = mongoose.connection.readyState === 1
  const broker = rabbit.isConnected()
  return { status: mongo && broker ? "ok" : "degraded", mongo: mongo ? "up" : "down", rabbitmq: broker ? "up" : "down" }
}

function writeHeartbeat() {
  const health = workerHealth()
  try {
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({ ...health, ts: Date.now() }))
  } catch (error) {
    logger.warn({ err: error.message }, "could not write the worker heartbeat")
  }
}

function startHeartbeat() {
  writeHeartbeat()
  const timer = setInterval(writeHeartbeat, HEARTBEAT_MS)
  timer.unref()
  return () => {
    clearInterval(timer)
    fs.rm(HEARTBEAT_FILE, { force: true }, () => {})
  }
}

module.exports = { workerHealth, startHeartbeat, HEARTBEAT_FILE, HEARTBEAT_MS }
