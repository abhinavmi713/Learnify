const { buildChunks } = require("./chunker")
const logger = require("./logger")

// Keeps the vector index in step with one course.
//
// Always rebuilds the course's points from the current content (delete, then
// upsert), which makes it idempotent: running it twice, or out of order, ends in
// the same state. A course that is no longer published (draft, rejected,
// archived, deleted) simply has its points removed.
function createIndexer({ fetchCourse, gemini, qdrant }) {
  async function indexCourse(courseId) {
    const started = Date.now()
    const course = await fetchCourse(courseId)

    if (!course || !course.searchable) {
      await qdrant.deleteCourse(courseId)
      logger.info({ courseId }, "course not searchable; removed from index")
      return { courseId, indexed: 0, removed: true }
    }

    const chunks = buildChunks(course)
    const vectors = await gemini.embed(chunks.map((c) => c.text), "RETRIEVAL_DOCUMENT")
    const points = chunks.map((c, i) => ({ id: c.id, vector: vectors[i], payload: { ...c.payload, text: c.text } }))

    await qdrant.deleteCourse(courseId)
    await qdrant.upsert(points)
    logger.info({ courseId, chunks: points.length, ms: Date.now() - started }, "course indexed")
    return { courseId, indexed: points.length, removed: false }
  }

  return { indexCourse }
}

// Reads course content from the main API's internal endpoint.
function createCourseFetcher({ apiInternalUrl, token }) {
  return async function fetchCourse(courseId) {
    const res = await fetch(`${apiInternalUrl}/courses/${courseId}/content`, { headers: { "X-Internal-Token": token } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`API returned ${res.status} for course ${courseId}`)
    return (await res.json()).data
  }
}

module.exports = { createIndexer, createCourseFetcher }
