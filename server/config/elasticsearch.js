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

// Hosted clusters need credentials: ELASTICSEARCH_API_KEY (Elastic Cloud), or
// user:password in the URL (Bonsai and similar). fetch() refuses URLs with
// credentials, so they are moved into an Authorization header.
function target() {
  const url = new URL(process.env.ELASTICSEARCH_URL)
  const headers = {}
  if (process.env.ELASTICSEARCH_API_KEY) headers.Authorization = `ApiKey ${process.env.ELASTICSEARCH_API_KEY}`
  else if (url.username) {
    const basic = Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64")
    headers.Authorization = `Basic ${basic}`
  }
  url.username = ""
  url.password = ""
  return { base: url.toString().replace(/\/$/, ""), headers }
}

async function es(method, path, body, { timeoutMs = 3000, ndjson = false } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const { base, headers } = target()
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": ndjson ? "application/x-ndjson" : "application/json", ...headers },
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
