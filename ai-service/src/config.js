require("dotenv").config({ quiet: true })
const { z } = require("zod")

// Validated configuration for the AI service. Fails fast at startup.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5001),
  LOG_LEVEL: z.string().default("info"),

  // Shared secret for calls between Learnify services (both directions).
  INTERNAL_API_TOKEN: z.string().min(24, "must be at least 24 characters"),
  // The main API, for reading course content (GET /internal/courses/...).
  API_INTERNAL_URL: z.string().url().default("http://localhost:4000/api/v1/internal"),

  GEMINI_API_KEY: z.string().min(10),
  EMBED_MODEL: z.string().default("gemini-embedding-001"),
  EMBED_DIM: z.coerce.number().int().positive().default(768),
  GEN_MODEL: z.string().default("gemini-3.6-flash"),

  QDRANT_URL: z.string().url().default("http://127.0.0.1:6333"),
  QDRANT_COLLECTION: z.string().default("course_chunks"),
  // Qdrant Cloud API key (not needed for the local container).
  QDRANT_API_KEY: z.string().optional().transform((v) => v || undefined),

  RABBITMQ_URL: z.string().optional().transform((v) => v || undefined),

  // Retrieval tuning (see scripts/evalRetrieval.js for how these were chosen).
  TOP_K: z.coerce.number().int().positive().default(6),
  MIN_SCORE: z.coerce.number().min(0).max(1).default(0.6),
})

function loadConfig(source = process.env) {
  const result = schema.safeParse(source)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    throw new Error(`Invalid AI service configuration:\n${lines.join("\n")}`)
  }
  return result.data
}

module.exports = { loadConfig }
