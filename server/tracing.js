// OpenTelemetry tracing. Loaded before anything else (first line of index.js and
// workers/index.js) so the auto-instrumentations can patch http, express,
// mongodb, ioredis and amqplib as they are required.
//
// Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set, e.g. http://localhost:4318 for
// the Jaeger container in docker-compose (profile "observability").
require("dotenv").config({ quiet: true })

let sdk = null

function startTracing(serviceName) {
  if (sdk || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.NODE_ENV === "test") return
  const { NodeSDK } = require("@opentelemetry/sdk-node")
  const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node")
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http")

  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || serviceName
  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "")}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Noisy and rarely useful.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        // Database/cache calls only inside a request or message trace: the outbox
        // relay polls every second and would otherwise create a trace each time.
        "@opentelemetry/instrumentation-mongoose": { requireParentSpan: true },
        "@opentelemetry/instrumentation-mongodb": { requireParentSpan: true },
        "@opentelemetry/instrumentation-ioredis": { requireParentSpan: true },
        // Health checks and scrapes would drown out real traffic.
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (req) => ["/health", "/metrics"].includes(req.url),
        },
      }),
    ],
  })
  sdk.start()
  const stop = () => sdk.shutdown().catch(() => {})
  process.once("SIGTERM", stop)
  process.once("SIGINT", stop)
}

module.exports = { startTracing }
