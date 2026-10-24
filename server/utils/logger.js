const pino = require("pino")

// Structured JSON logs (one line per entry) instead of scattered console.log
// calls — trivial to pipe into a log aggregator later, and every log line
// carries a timestamp and level for free.
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
})

module.exports = logger
