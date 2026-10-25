const { withBreaker, withTimeout } = require("./resilience")

// Client for the AI service (course-grounded answers). Behind a circuit breaker
// with a timeout: if the AI service is slow or down, callers fail fast and fall
// back to a plain model answer instead of making students wait.
const isConfigured = () => Boolean(process.env.AI_SERVICE_URL && process.env.INTERNAL_API_TOKEN)

const ask = withBreaker(
  "ai-service",
  async ({ courseId, courseName, question }) => {
    const res = await withTimeout(
      fetch(`${process.env.AI_SERVICE_URL}/v1/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": process.env.INTERNAL_API_TOKEN },
        body: JSON.stringify({ courseId, courseName, question }),
      }),
      20000,
      "ai-service"
    )
    if (!res.ok) throw new Error(`ai-service responded ${res.status}`)
    return (await res.json()).data
  },
  { timeout: 22000, volumeThreshold: 5, resetTimeout: 20000 }
)

module.exports = { isConfigured, ask }
