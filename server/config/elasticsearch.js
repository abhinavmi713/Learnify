const logger = require("../utils/logger")
const { registerCheck } = require("../utils/health")

// Minimal Elasticsearch REST client (fetch + JSON). Search is optional: when
// ELASTICSEARCH_URL is unset, callers use the MongoDB implementation instead.
const isConfigured = () => Boolean(process.env.ELASTICSEARCH_URL)

class EsError extends Error {
  constructor(status, body) {
    super(`elasticsearch ${status}: ${typeof body === "string" ? body : JSON.stringify(body?.error?.reason || body?.error || body)}`)
    this.status = status
    this.body = body
  }
}

async function es(method, path, body, { timeoutMs = 3000, ndjson = false } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${process.env.ELASTICSEARCH_URL}${path}`, {
      method,
      headers: { "Content-Type": ndjson ? "application/x-ndjson" : "application/json" },
      body: body === undefined ? undefined : ndjson ? body : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) throw new EsError(res.status, data)
    return data
  } finally {
    clearTimeout(timer)
  }
}

let registered = false
function registerHealth() {
  if (registered || !isConfigured()) return
  registered = true
  registerCheck("elasticsearch", () => es("GET", "/_cluster/health"), { critical: false })
  logger.info("elasticsearch search enabled")
}

module.exports = { es, EsError, isConfigured, registerHealth }
