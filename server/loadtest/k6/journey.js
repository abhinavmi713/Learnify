// Mixed user journey (k6): what a visitor actually does, with think time.
// browse catalog -> type in search box -> search -> open a course.
//
//   docker run --rm -v "$PWD/loadtest/k6:/scripts" -e BASE=http://host.docker.internal:4010 \
//     grafana/k6:0.54.0 run /scripts/journey.js
import http from "k6/http"
import { check, group, sleep } from "k6"

const BASE = __ENV.BASE || "http://host.docker.internal:4010"
const JSON_HEADERS = { headers: { "Content-Type": "application/json" } }

export const options = {
  scenarios: {
    visitors: {
      executor: "ramping-vus",
      stages: [
        { duration: "15s", target: Number(__ENV.VUS || 50) },
        { duration: __ENV.DURATION || "60s", target: Number(__ENV.VUS || 50) },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800", "p(99)<1500"],
    "http_req_duration{name:catalog}": ["p(95)<200"],
  },
}

const TERMS = ["javascript", "python", "react", "docker", "design", "sql", "node"]
const pick = (a) => a[Math.floor(Math.random() * a.length)]

export default function () {
  group("browse catalog", () => {
    const res = http.get(`${BASE}/api/v1/course/getAllCourses`, { tags: { name: "catalog" } })
    check(res, { "catalog 200": (r) => r.status === 200 })
  })
  sleep(1)

  let courseId = null
  group("search", () => {
    const term = pick(TERMS)
    for (const n of [2, 3, 4]) http.get(`${BASE}/api/v1/course/suggest?q=${term.slice(0, n)}`, { tags: { name: "suggest" } })
    const res = http.post(`${BASE}/api/v1/course/searchCourses`, JSON.stringify({ search: term }), { ...JSON_HEADERS, tags: { name: "search" } })
    check(res, { "search 200": (r) => r.status === 200 })
    const hits = res.json("data") || []
    if (hits.length) courseId = pick(hits)._id
  })
  sleep(2)

  if (courseId) {
    group("course page", () => {
      const res = http.post(`${BASE}/api/v1/course/getCourseDetails`, JSON.stringify({ courseId }), { ...JSON_HEADERS, tags: { name: "course" } })
      check(res, { "course 200": (r) => r.status === 200 })
    })
  }
  sleep(2)
}
