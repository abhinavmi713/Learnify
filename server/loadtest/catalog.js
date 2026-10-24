// Load test for the public catalog endpoint, comparing three cache strategies.
//
//   node loadtest/catalog.js http://localhost:4010 uncached
//   node loadtest/catalog.js http://localhost:4010 cached
//
// Run the API with NODE_ENV=test so the rate limiters (300 req/min per IP) do
// not throttle the benchmark itself:
//   NODE_ENV=test PORT=4010 node index.js                    (Redis cache, REDIS_URL set)
//   NODE_ENV=test PORT=4011 REDIS_URL= node index.js         (in-process cache)
//
// "uncached" gives every request a unique query string, so every request misses
// and runs the full MongoDB query. "cached" repeats one URL, so after the first
// request every response is a cache hit.
const autocannon = require("autocannon")

const [base = "http://localhost:4010", mode = "cached"] = process.argv.slice(2)
const duration = Number(process.env.DURATION) || 10
const connections = Number(process.env.CONNECTIONS) || 50

const path = "/api/v1/course/getAllCourses"

autocannon(
  {
    url: base,
    connections,
    duration,
    requests: [
      {
        method: "GET",
        setupRequest: (req) => {
          req.path = mode === "uncached" ? `${path}?cb=${Math.random().toString(36).slice(2)}` : path
          return req
        },
      },
    ],
  },
  (err, r) => {
    if (err) throw err
    const ok = r["2xx"]
    console.log(
      JSON.stringify(
        {
          target: base,
          mode,
          connections,
          seconds: duration,
          reqPerSec: Math.round(r.requests.average),
          latencyMs: { avg: r.latency.average, p50: r.latency.p50, p97_5: r.latency.p97_5, p99: r.latency.p99 },
          totalRequests: r.requests.total,
          non2xx: r.non2xx,
          ok,
        },
        null,
        2
      )
    )
  }
)
