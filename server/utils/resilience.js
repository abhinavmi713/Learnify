const CircuitBreaker = require("opossum")
const logger = require("./logger")

// Protection for calls to things we do not control (SMTP, Razorpay, Gemini).
//
//  * timeout   : never wait forever on a slow provider.
//  * retry     : transient failures are retried with exponential backoff and
//                jitter. Only wrap idempotent calls in `retry`.
//  * breaker   : after enough failures the circuit OPENS and calls fail
//                immediately for a cool-down, so a dead provider does not tie up
//                workers/requests; it then lets one call through (half-open) to
//                see whether the provider has recovered.
const breakers = new Map()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function withTimeout(promise, ms, label = "operation") {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function retry(fn, { retries = 2, baseMs = 200, maxMs = 5000, shouldRetry = () => true } = {}) {
  let attempt = 0
  for (;;) {
    try {
      return await fn(attempt)
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt)
      await sleep(backoff / 2 + Math.random() * (backoff / 2)) // equal jitter
      attempt++
    }
  }
}

// Returns a function with the same signature as `fn`, guarded by a named breaker.
function withBreaker(name, fn, options = {}) {
  const breaker = new CircuitBreaker(fn, {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 15000,
    volumeThreshold: 5,
    ...options,
  })
  breaker.on("open", () => logger.warn({ breaker: name }, "circuit opened: failing fast"))
  breaker.on("halfOpen", () => logger.info({ breaker: name }, "circuit half-open: probing"))
  breaker.on("close", () => logger.info({ breaker: name }, "circuit closed: recovered"))
  breakers.set(name, breaker)
  return (...args) => breaker.fire(...args)
}

function breakerStates() {
  return Object.fromEntries(
    [...breakers].map(([name, b]) => [name, b.opened ? "open" : b.halfOpen ? "half-open" : "closed"])
  )
}

module.exports = { withTimeout, retry, withBreaker, breakerStates }
