const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const { validateEnv } = require("./config/env");
const { closeRedis, redisConfigured } = require("./config/redis");
const rabbit = require("./config/rabbit");
const relay = require("./events/relay");

// Fail fast on bad configuration, before anything connects.
validateEnv();

const app = require("./app");
const database = require("./config/database");
const { cloudinaryConnect } = require("./config/cloudinary");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 4000;

// Connect to the database
database.connect();

// Connect to Redis now (not on first request) so the cache and rate limits are
// shared from the first request; a no-op when REDIS_URL is unset.
redisConfigured();

// Outbox -> broker. The relay publishes events that business code recorded in
// the database; without RABBITMQ_URL it hands them to in-process consumers.
rabbit.start();
relay.startRelay();

// With RabbitMQ configured the consumers normally run in a separate process
// (`npm run worker`). For a simple local setup the API can host them itself.
const hostWorker =
  rabbit.isConfigured() &&
  (process.env.RUN_WORKER_IN_API === "1" ||
    (process.env.RUN_WORKER_IN_API === undefined && process.env.NODE_ENV !== "production"));
if (hostWorker) {
  require("./workers").startConsumers().catch((error) => logger.error({ err: error.message }, "could not start in-process worker"));
}

// Connect to Cloudinary
cloudinaryConnect();

// Start the server
const server = app.listen(PORT, () => {
  logger.info(`App is listening at http://localhost:${PORT}`);
});

// Orchestrators (Docker, PM2, Kubernetes) stop a process with SIGTERM. Finish
// in-flight requests and close the DB connection instead of dropping them.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  // If a connection hangs, don't wait forever.
  setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {
    relay.stopRelay();
    await rabbit.close();
    await mongoose.disconnect();
    await closeRedis();
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// An unhandled rejection or exception leaves the process in an unknown state:
// log it with full detail and exit so the supervisor restarts a clean one.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  process.exit(1);
});
