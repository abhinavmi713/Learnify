// Container health check for both processes that run from this image:
//   node index.js            the API: GET /health must answer 200
//   node workers/index.js    the worker: its heartbeat file must be fresh and "ok"
// The process is identified from PID 1's command line, so one HEALTHCHECK line in
// the Dockerfile fits whichever command the platform starts.
const fs = require("fs")
const os = require("os")
const path = require("path")

const STALE_MS = 60 * 1000

function command() {
  try {
    return fs.readFileSync("/proc/1/cmdline", "utf8").split("\0").join(" ")
  } catch (error) {
    return process.env.HEALTHCHECK_ROLE === "worker" ? "workers/index.js" : ""
  }
}

function checkWorker() {
  const file = process.env.WORKER_HEARTBEAT_FILE || path.join(os.tmpdir(), "learnify-worker-health.json")
  const beat = JSON.parse(fs.readFileSync(file, "utf8"))
  if (Date.now() - beat.ts > STALE_MS) throw new Error(`heartbeat is ${Math.round((Date.now() - beat.ts) / 1000)} s old`)
  if (beat.status !== "ok") throw new Error(`mongo ${beat.mongo}, rabbitmq ${beat.rabbitmq}`)
}

async function checkApi() {
  const res = await fetch(`http://127.0.0.1:${process.env.PORT || 4000}/health`, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) throw new Error(`/health answered ${res.status}`)
}

async function main() {
  if (command().includes("workers/index.js")) checkWorker()
  else await checkApi()
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`unhealthy: ${error.message}`)
    process.exit(1)
  }
)
