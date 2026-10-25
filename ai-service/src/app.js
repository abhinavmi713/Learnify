const crypto = require("crypto")
const express = require("express")
const { z } = require("zod")
const logger = require("./logger")

// HTTP surface of the AI service. Internal only: every route except /health
// requires the shared X-Internal-Token, and the service is not exposed to
// browsers (the main API proxies student questions after checking access).
function createApp({ token, rag, indexer, health }) {
  const app = express()
  app.use(express.json({ limit: "64kb" }))

  app.get("/health", async (req, res) => {
    const status = await health()
    res.status(status.ok ? 200 : 503).json(status)
  })

  app.use((req, res, next) => {
    const given = Buffer.from(req.header("X-Internal-Token") || "")
    const expected = Buffer.from(token)
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(401).json({ success: false, message: "Unauthorized" })
    }
    next()
  })

  const askSchema = z.object({
    courseId: z.string().regex(/^[a-f0-9]{24}$/i, "invalid courseId"),
    courseName: z.string().max(200).optional(),
    question: z.string().trim().min(2).max(2000),
  })

  app.post("/v1/ask", async (req, res) => {
    const parsed = askSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    try {
      const result = await rag.answer(parsed.data)
      logger.info({ courseId: parsed.data.courseId, retrieved: result.retrieved, grounded: result.grounded, ms: result.timingsMs.total }, "answered")
      return res.json({ success: true, data: result })
    } catch (error) {
      logger.error({ err: error.message }, "answer failed")
      return res.status(502).json({ success: false, message: "Could not answer right now" })
    }
  })

  // Manual (re)index of one course, e.g. after changing chunking settings.
  app.post("/v1/index/:courseId", async (req, res) => {
    try {
      return res.json({ success: true, data: await indexer.indexCourse(req.params.courseId) })
    } catch (error) {
      return res.status(502).json({ success: false, message: error.message })
    }
  })

  return app
}

module.exports = { createApp }
