// Minimal Qdrant REST client for the one collection this service owns.
function createQdrant({ url, collection, dim }) {
  async function call(method, path, body) {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data?.status?.error || `Qdrant HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    return data.result
  }

  // Creates the collection (cosine distance) and a keyword index on courseId,
  // which every search filters by. Safe to call on every start.
  async function ensureCollection() {
    const exists = await call("GET", `/collections/${collection}/exists`).catch(() => ({ exists: false }))
    if (!exists.exists) {
      await call("PUT", `/collections/${collection}`, { vectors: { size: dim, distance: "Cosine" } })
      await call("PUT", `/collections/${collection}/index?wait=true`, { field_name: "courseId", field_schema: "keyword" })
    }
  }

  async function upsert(points) {
    if (!points.length) return
    await call("PUT", `/collections/${collection}/points?wait=true`, { points })
  }

  async function deleteCourse(courseId) {
    await call("POST", `/collections/${collection}/points/delete?wait=true`, {
      filter: { must: [{ key: "courseId", match: { value: courseId } }] },
    })
  }

  // Nearest chunks of ONE course: a student's question about course A must never
  // be answered from course B.
  async function search(vector, { courseId, limit, scoreThreshold }) {
    return call("POST", `/collections/${collection}/points/search`, {
      vector,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true,
      filter: { must: [{ key: "courseId", match: { value: courseId } }] },
    })
  }

  async function countCourse(courseId) {
    const r = await call("POST", `/collections/${collection}/points/count`, {
      exact: true,
      filter: { must: [{ key: "courseId", match: { value: courseId } }] },
    })
    return r.count
  }

  async function ping() {
    await call("GET", "/collections")
  }

  return { ensureCollection, upsert, deleteCourse, search, countCourse, ping }
}

module.exports = { createQdrant }
