// Search load test (k6). Compares the search engines on the same data.
//
//   docker run --rm -v "$PWD/loadtest/k6:/scripts" -e BASE=http://host.docker.internal:4010 \
//     grafana/k6:0.54.0 run /scripts/search.js
//
// See loadtest/README.md for starting the API against the load database.
import http from "k6/http"
import { check, sleep } from "k6"

const BASE = __ENV.BASE || "http://host.docker.internal:4010"

export const options = {
  scenarios: {
    search: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: Number(__ENV.VUS || 30) },
        { duration: __ENV.DURATION || "40s", target: Number(__ENV.VUS || 30) },
        { duration: "5s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:search}": ["p(95)<800"],
    "http_req_duration{kind:suggest}": ["p(95)<300"],
  },
}

// Real queries are messy: whole words, partial words, typos, two-word phrases.
const QUERIES = ["javascript", "pyth", "react hooks", "dockr", "kubernetes", "machine learning", "desgin", "node", "sql", "data analysis", "typescrpt", "system design", "aws", "git", "redis"]
const PREFIXES = ["ja", "pyt", "rea", "doc", "kub", "mac", "fig", "ty", "sys", "gra"]
const pick = (a) => a[Math.floor(Math.random() * a.length)]

export default function () {
  const res = http.post(
    `${BASE}/api/v1/course/searchCourses`,
    JSON.stringify({ search: pick(QUERIES), page: 1, limit: 12, ...(Math.random() < 0.3 ? { maxPrice: 999 } : {}) }),
    { headers: { "Content-Type": "application/json" }, tags: { kind: "search" } }
  )
  check(res, { "search 200": (r) => r.status === 200 })

  const s = http.get(`${BASE}/api/v1/course/suggest?q=${pick(PREFIXES)}`, { tags: { kind: "suggest" } })
  check(s, { "suggest 200": (r) => r.status === 200 })
  sleep(0.2)
}
