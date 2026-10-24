// Registry of dependency health checks behind GET /health.
//
// Each backing service (Mongo, Redis, RabbitMQ, ...) registers a probe when it
// connects. A `critical` probe failing makes the API report 503 (take it out of
// the load balancer); a non-critical one only shows up as "down" because the app
// degrades gracefully without it (e.g. cache falls back to memory).
const checks = new Map()

function registerCheck(name, probe, { critical = false, timeoutMs = 1500 } = {}) {
  checks.set(name, { probe, critical, timeoutMs })
}

async function runOne(name, { probe, critical, timeoutMs }) {
  const started = Date.now()
  try {
    await Promise.race([
      Promise.resolve().then(probe),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ])
    return [name, { status: "up", ms: Date.now() - started, critical }]
  } catch (error) {
    return [name, { status: "down", error: error.message, critical }]
  }
}

// Returns { ok, dependencies }. `ok` is false only when a critical dependency is down.
async function runChecks() {
  const results = await Promise.all([...checks].map(([name, cfg]) => runOne(name, cfg)))
  const dependencies = Object.fromEntries(results)
  const ok = results.every(([, r]) => r.status === "up" || !r.critical)
  return { ok, dependencies }
}

// Test helper.
function resetChecks() {
  checks.clear()
}

module.exports = { registerCheck, runChecks, resetChecks }
