const { isConfigured } = require("../../config/elasticsearch")
const { indexCourse } = require("../../search/courseIndex")

// Keeps the search index in step with MongoDB. Every event carries course ids;
// the handler re-reads each course and replaces its document, so applying an
// event twice (redelivery) or out of order still ends with the current state.
async function handleSearchIndex(event) {
  if (!isConfigured()) return
  const ids = event.payload.courseIds || (event.payload.courseId ? [event.payload.courseId] : [])
  for (const id of ids) await indexCourse(String(id))
}

module.exports = { handleSearchIndex }
