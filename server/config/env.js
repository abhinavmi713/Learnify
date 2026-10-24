const { z } = require("zod")

// Validated environment. Called once at startup so a missing or malformed
// setting stops the server with a clear message instead of surfacing later as
// a confusing runtime error (e.g. "jwt must be provided").
//
// Backing services are optional: when REDIS_URL / RABBITMQ_URL / QDRANT_URL are
// unset the app falls back to in-process equivalents, so plain `npm start` and
// the test suite work without Docker.
const optionalUrl = (protocols) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || protocols.some((p) => v.startsWith(p)), {
      message: `must start with ${protocols.join(" or ")}`,
    })

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),

  JWT_SECRET: z.string().min(16, "must be at least 16 characters"),
  MONGODB_URL: z.string().min(1).refine((v) => v.startsWith("mongodb"), {
    message: "must be a mongodb:// or mongodb+srv:// URL",
  }),

  REDIS_URL: optionalUrl(["redis://", "rediss://"]),
  RABBITMQ_URL: optionalUrl(["amqp://", "amqps://"]),
  QDRANT_URL: optionalUrl(["http://", "https://"]),
  AI_SERVICE_URL: optionalUrl(["http://", "https://"]),
})

// Production needs stronger guarantees than a laptop does.
const productionRules = (env, ctx) => {
  if (env.NODE_ENV !== "production") return
  if (env.JWT_SECRET.length < 32) {
    ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "must be at least 32 characters in production" })
  }
  if (!env.CLIENT_URL || env.CLIENT_URL.includes("localhost")) {
    ctx.addIssue({ code: "custom", path: ["CLIENT_URL"], message: "must be your real frontend origin in production" })
  }
}

// Parses and returns the typed config. Does not exit; `validateEnv` does that.
function parseEnv(source = process.env) {
  return schema.superRefine(productionRules).safeParse(source)
}

// Startup guard used by index.js. Skipped under Jest, where each test file
// sets exactly the variables it needs.
function validateEnv(source = process.env) {
  const result = parseEnv(source)
  if (result.success) return result.data

  const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`)
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${lines.join("\n")}\nSee server/.env.example`)
  process.exit(1)
}

module.exports = { parseEnv, validateEnv }
