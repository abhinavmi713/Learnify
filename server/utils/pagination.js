// Shared pagination helper for list endpoints. Keeping every "list everything"
// endpoint bounded is what stops a large collection from becoming a slow,
// memory-heavy request and an unbounded JSON payload.
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function getPagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

function buildPaginationMeta(total, page, limit) {
  return { page, limit, total, pages: Math.ceil(total / limit) || 1 }
}

module.exports = { getPagination, buildPaginationMeta }
