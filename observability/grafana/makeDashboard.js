// Generates dashboards/learnify-overview.json:
//   node observability/grafana/makeDashboard.js observability/grafana/dashboards/learnify-overview.json
// Edit panels here rather than in the JSON.
const fs = require("fs")
const ds = { type: "prometheus", uid: "prometheus" }
let id = 1
const panel = (title, exprs, { x, y, w = 12, h = 8, unit = "short", type = "timeseries", desc = "" }) => ({
  id: id++,
  type,
  title,
  description: desc,
  datasource: ds,
  gridPos: { x, y, w, h },
  fieldConfig: { defaults: { unit, custom: type === "timeseries" ? { lineWidth: 2, fillOpacity: 10 } : undefined }, overrides: [] },
  options: type === "stat" ? { reduceOptions: { calcs: ["lastNotNull"] }, colorMode: "value", graphMode: "area" } : { legend: { displayMode: "list", placement: "bottom" }, tooltip: { mode: "multi" } },
  targets: exprs.map(([expr, legendFormat], i) => ({ refId: String.fromCharCode(65 + i), datasource: ds, expr, legendFormat })),
})
const row = (title, y) => ({ id: id++, type: "row", title, collapsed: false, gridPos: { x: 0, y, w: 24, h: 1 }, panels: [] })

const panels = [
  row("API", 0),
  panel("Requests / s", [['sum(rate(http_request_duration_seconds_count[1m]))', "total"], ['sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[1m]))', "5xx"]], { x: 0, y: 1, w: 8, unit: "reqps" }),
  panel("Error rate", [['(sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])) or vector(0)) / sum(rate(http_request_duration_seconds_count[5m]))', "5xx share"]], { x: 8, y: 1, w: 4, unit: "percentunit", type: "stat" }),
  panel("p95 latency", [['histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{route!="unmatched"}[5m])))', "p95"]], { x: 12, y: 1, w: 4, unit: "s", type: "stat" }),
  panel("Cache hit ratio", [['sum(rate(learnify_cache_requests_total{result=~"hit|wait"}[5m])) / sum(rate(learnify_cache_requests_total[5m]))', "hit ratio"]], { x: 16, y: 1, w: 4, unit: "percentunit", type: "stat", desc: "Catalog responses served from Redis (wait = filled by a concurrent request, stampede protection)" }),
  panel("Live sockets", [["sum(learnify_socket_connections)", "connections"]], { x: 20, y: 1, w: 4, type: "stat" }),
  panel("p95 latency by route (top 8)", [['topk(8, histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{route!="unmatched"}[5m]))))', "{{route}}"]], { x: 0, y: 9, w: 12, unit: "s" }),
  panel("Requests / s by route (top 8)", [['topk(8, sum by (route) (rate(http_request_duration_seconds_count[1m])))', "{{route}}"]], { x: 12, y: 9, w: 12, unit: "reqps" }),

  row("Events and workers", 17),
  panel("Outbox", [['learnify_outbox_events', "{{status}}"]], { x: 0, y: 18, w: 8, desc: "Events written but not yet published. Should hover near zero." }),
  panel("Relay lag", [["learnify_outbox_oldest_pending_age_seconds", "oldest pending"]], { x: 8, y: 18, w: 4, unit: "s", type: "stat" }),
  panel("Queue depth", [['sum by (queue) (rabbitmq_queue_messages{queue!~".*retry.*"})', "{{queue}}"]], { x: 12, y: 18, w: 12, desc: "From RabbitMQ's exporter. A growing queue means consumers are behind; anything in a .dlq needs a human." }),
  panel("Events processed / s", [['sum by (consumer, outcome) (rate(learnify_events_processed_total[5m]))', "{{consumer}} {{outcome}}"]], { x: 0, y: 26, w: 12 }),
  panel("Event handling p95", [['histogram_quantile(0.95, sum by (le, consumer) (rate(learnify_event_processing_duration_seconds_bucket[5m])))', "{{consumer}}"]], { x: 12, y: 26, w: 12, unit: "s" }),

  row("Business and dependencies", 34),
  panel("Orders fulfilled / min", [['sum by (source) (rate(learnify_orders_fulfilled_total[5m])) * 60', "{{source}}"]], { x: 0, y: 35, w: 8 }),
  panel("Search engine", [['sum by (engine, kind) (rate(learnify_search_requests_total[5m]))', "{{engine}} {{kind}}"]], { x: 8, y: 35, w: 8, unit: "reqps", desc: "mongo here while Elasticsearch is configured means the fallback is in use" }),
  panel("Open circuit breakers", [["sum(learnify_circuit_breaker_open)", "open"]], { x: 16, y: 35, w: 4, type: "stat" }),
  panel("Webhook deliveries / min", [['sum by (outcome) (rate(learnify_webhook_deliveries_total[5m])) * 60', "{{outcome}}"]], { x: 20, y: 35, w: 4 }),

  row("Node.js", 43),
  panel("Memory (RSS)", [['process_resident_memory_bytes{job=~"learnify.*"}', "{{job}}"]], { x: 0, y: 44, w: 8, unit: "bytes" }),
  panel("Event loop lag p99", [['nodejs_eventloop_lag_p99_seconds{job=~"learnify.*"}', "{{job}}"]], { x: 8, y: 44, w: 8, unit: "s" }),
  panel("CPU", [['rate(process_cpu_seconds_total{job=~"learnify.*"}[1m])', "{{job}}"]], { x: 16, y: 44, w: 8, unit: "percentunit" }),
]

const dashboard = {
  uid: "learnify-overview",
  title: "Learnify overview",
  tags: ["learnify"],
  timezone: "browser",
  schemaVersion: 39,
  refresh: "10s",
  time: { from: "now-30m", to: "now" },
  panels,
}
fs.writeFileSync(process.argv[2], JSON.stringify(dashboard, null, 2) + "\n")
