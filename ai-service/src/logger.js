const pino = require("pino")

module.exports = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : process.env.LOG_LEVEL || "info",
  base: { service: "ai-service" },
})
