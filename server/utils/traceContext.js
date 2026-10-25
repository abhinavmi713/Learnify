// Carries a trace across the outbox. An event is written during a request but
// published later by the relay, outside that request's context. We store the
// W3C traceparent with the event and restore it when publishing, so the trace
// continues: HTTP request -> outbox -> RabbitMQ -> worker -> email/refund/index.
// Without @opentelemetry/api active (tracing off) these are no-ops.
let api = null
try {
  api = require("@opentelemetry/api")
} catch (error) {
  api = null
}

function captureTraceContext() {
  if (!api) return null
  const carrier = {}
  api.propagation.inject(api.context.active(), carrier)
  return carrier.traceparent ? carrier : null
}

function withTraceContext(carrier, fn) {
  if (!api || !carrier) return fn()
  return api.context.with(api.propagation.extract(api.ROOT_CONTEXT, carrier), fn)
}

// Runs fn inside a new span. `parent` (a carrier like message headers) makes it
// a child of a trace from another process; otherwise it joins the active one.
async function inSpan(name, { kind = "INTERNAL", attributes, parent } = {}, fn) {
  if (!api) return fn()
  const ctx = parent ? api.propagation.extract(api.ROOT_CONTEXT, parent) : api.context.active()
  const tracer = api.trace.getTracer("learnify")
  return tracer.startActiveSpan(name, { kind: api.SpanKind[kind], attributes }, ctx, async (span) => {
    try {
      return await fn(span)
    } catch (error) {
      span.recordException(error)
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message })
      throw error
    } finally {
      span.end()
    }
  })
}

// Adds the active trace context to outgoing message headers.
function injectHeaders(headers = {}) {
  if (api) api.propagation.inject(api.context.active(), headers)
  return headers
}

module.exports = { captureTraceContext, withTraceContext, inSpan, injectHeaders }
