// Learnify AI service: course-grounded Q&A (RAG).
//   npm start            run the service (port 5001)
//   npm run reindex      rebuild the whole index from the main API
const { loadConfig } = require("./config")
const logger = require("./logger")
const { createGemini } = require("./gemini")
const { createQdrant } = require("./qdrant")
const { createIndexer, createCourseFetcher } = require("./indexer")
const { createRag } = require("./rag")
const { createApp } = require("./app")
const { startConsumer } = require("./consumer")

function buildServices(config) {
  const gemini = createGemini({ apiKey: config.GEMINI_API_KEY, embedModel: config.EMBED_MODEL, embedDim: config.EMBED_DIM, genModel: config.GEN_MODEL })
  const qdrant = createQdrant({ url: config.QDRANT_URL, collection: config.QDRANT_COLLECTION, dim: config.EMBED_DIM, apiKey: config.QDRANT_API_KEY })
  const fetchCourse = createCourseFetcher({ apiInternalUrl: config.API_INTERNAL_URL, token: config.INTERNAL_API_TOKEN })
  const indexer = createIndexer({ fetchCourse, gemini, qdrant })
  const rag = createRag({ gemini, qdrant, topK: config.TOP_K, minScore: config.MIN_SCORE })
  return { gemini, qdrant, indexer, rag }
}

async function main() {
  const config = loadConfig()
  const { qdrant, indexer, rag } = buildServices(config)
  await qdrant.ensureCollection()

  let consumer = null
  if (config.RABBITMQ_URL) {
    consumer = await startConsumer({ url: config.RABBITMQ_URL, onCourseChanged: (courseId) => indexer.indexCourse(courseId) })
  } else {
    logger.warn("RABBITMQ_URL not set: the index is only updated by manual /v1/index calls or npm run reindex")
  }

  const health = async () => {
    const qdrantUp = await qdrant.ping().then(() => true, () => false)
    const rabbitUp = consumer ? consumer.isConnected() : null
    return { ok: qdrantUp, dependencies: { qdrant: qdrantUp ? "up" : "down", rabbitmq: rabbitUp === null ? "disabled" : rabbitUp ? "up" : "down" } }
  }

  const app = createApp({ token: config.INTERNAL_API_TOKEN, rag, indexer, health })
  const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, "ai-service listening"))

  const stop = async () => {
    setTimeout(() => process.exit(1), 8000).unref()
    server.close()
    if (consumer) await consumer.stop()
    process.exit(0)
  }
  process.on("SIGTERM", stop)
  process.on("SIGINT", stop)
}

if (require.main === module) {
  main().catch((error) => {
    logger.error({ err: error.message }, "ai-service failed to start")
    process.exit(1)
  })
}

module.exports = { buildServices }
