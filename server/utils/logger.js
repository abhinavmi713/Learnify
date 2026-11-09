const pino = require("pino")

// Structured JSON logs (one line per entry) instead of scattered console.log
// calls — trivial to pipe into a log aggregator later, and every log line
// carries a timestamp and level for free.
// Request logs must never contain credentials.
const redactPaths = ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]']

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: redactPaths,
})

module.exports = logger
module.exports.redactPaths = redactPaths
