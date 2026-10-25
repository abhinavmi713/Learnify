const client = require("prom-client")

// Prometheus metrics. One registry per process; the API serves it at /metrics,
// the worker on its own port (workers/index.js). Names follow Prometheus
// conventions: base units (seconds), _total for counters, low-cardinality labels
// (route templates, never raw URLs or ids).
const register = client.register

if (process.env.NODE_ENV !== "test") {
  client.collectDefaultMetrics({ register })
}

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency by route template and status",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
})

const cacheRequests = new client.Counter({
  name: "learnify_cache_requests_total",
  help: "Response cache lookups by result (hit, miss, wait = filled by a concurrent request)",
  labelNames: ["namespace", "result"],
})

const eventsPublished = new client.Counter({
  name: "learnify_events_published_total",
  help: "Outbox events published to the broker",
  labelNames: ["type", "outcome"],
})

const eventsProcessed = new client.Counter({
  name: "learnify_events_processed_total",
  help: "Events handled by consumers",
  labelNames: ["consumer", "outcome"],
})

const eventProcessingDuration = new client.Histogram({
  name: "learnify_event_processing_duration_seconds",
  help: "Time a consumer spends on one event",
  labelNames: ["consumer"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
})

const searchRequests = new client.Counter({
  name: "learnify_search_requests_total",
  help: "Course searches by the engine that answered",
  labelNames: ["engine", "kind"],
})

const ordersFulfilled = new client.Counter({
  name: "learnify_orders_fulfilled_total",
  help: "Orders delivered (enrollments created)",
  labelNames: ["source"],
})

const webhookDeliveries = new client.Counter({
  name: "learnify_webhook_deliveries_total",
  help: "Outbound webhook delivery attempts",
  labelNames: ["outcome"],
})

// Gauges computed at scrape time from the current state of the system.
function gauge(name, help, labelNames, collect) {
  return new client.Gauge({
    name,
    help,
    labelNames,
    async collect() {
      try {
        await collect(this)
      } catch (error) {
        // A failing probe must not break the whole scrape.
      }
    },
  })
}

gauge("learnify_outbox_events", "Outbox rows by status", ["status"], async (g) => {
  const OutboxEvent = require("../models/OutboxEvent")
  const rows = await OutboxEvent.aggregate([{ $match: { status: { $ne: "sent" } } }, { $group: { _id: "$status", n: { $sum: 1 } } }])
  g.reset()
  for (const status of ["pending", "publishing", "failed"]) g.set({ status }, rows.find((r) => r._id === status)?.n || 0)
})

gauge("learnify_outbox_oldest_pending_age_seconds", "Age of the oldest unpublished event (relay lag)", [], async (g) => {
  const OutboxEvent = require("../models/OutboxEvent")
  const oldest = await OutboxEvent.findOne({ status: { $in: ["pending", "publishing"] } }).sort({ createdAt: 1 }).select("createdAt").lean()
  g.set(oldest ? (Date.now() - new Date(oldest.createdAt).getTime()) / 1000 : 0)
})

gauge("learnify_circuit_breaker_open", "1 when a circuit breaker is open (failing fast)", ["breaker"], async (g) => {
  const { breakerStates } = require("./resilience")
  g.reset()
  for (const [name, state] of Object.entries(breakerStates())) g.set({ breaker: name }, state === "open" ? 1 : 0)
})

gauge("learnify_socket_connections", "Connected Socket.IO clients on this instance", [], async (g) => {
  const { connectionCount } = require("../realtime")
  g.set(connectionCount())
})

// Express middleware recording request latency under the matched route
// template (e.g. /api/v1/course/:id), so ids do not explode label cardinality.
function httpMetrics(req, res, next) {
  const end = httpDuration.startTimer()
  res.on("finish", () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : "unmatched"
    end({ method: req.method, route, status_code: res.statusCode })
  })
  next()
}

// GET /metrics. In production set METRICS_TOKEN and give it to Prometheus
// (bearer_token); without it the endpoint is only served outside production.
async function metricsHandler(req, res) {
  const token = process.env.METRICS_TOKEN
  if (token) {
    if (req.get("Authorization") !== `Bearer ${token}`) return res.status(401).end()
  } else if (process.env.NODE_ENV === "production") {
    return res.status(404).end()
  }
  res.set("Content-Type", register.contentType)
  return res.end(await register.metrics())
}

module.exports = {
  register,
  httpMetrics,
  metricsHandler,
  cacheRequests,
  eventsPublished,
  eventsProcessed,
  eventProcessingDuration,
  searchRequests,
  ordersFulfilled,
  webhookDeliveries,
}
