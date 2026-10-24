// Runs before every test file. Tests must never depend on (or write into) the
// developer's real services: server/.env points at local Redis/RabbitMQ, and the
// app loads that file with dotenv. dotenv never overrides a variable that is
// already defined, so defining these as empty here keeps the app on its
// in-process fallbacks (memory cache, in-process event bus).
// Tests that want the real thing opt in explicitly (see rabbit.integration.test.js).
process.env.REDIS_URL = ""
process.env.RABBITMQ_URL = ""
process.env.QDRANT_URL = ""
process.env.NODE_ENV = "test"
