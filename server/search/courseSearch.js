const { es } = require("../config/elasticsearch")
const { withBreaker } = require("../utils/resilience")
const { alias } = require("./courseIndex")

// Course search on Elasticsearch.
//
// Relevance: a match in the title counts most, then tags, instructor, lecture
// titles, and the description; typos are tolerated (fuzziness) and partial words
// match through the edge-n-gram subfield. Among similarly relevant courses,
// popular and well-rated ones rank a little higher (function_score).
//
// Facets are computed from the query alone and the filters are applied as a
// post_filter, so the category/price counts show what each choice WOULD give
// instead of collapsing to the currently selected option.
const TEXT_FIELDS = [
  "courseName^5",
  "tags^3",
  "instructorName^2",
  "lectureTitles^1.5",
  "whatYouWillLearn",
  "courseDescription",
]

const SORTS = {
  relevance: [{ _score: "desc" }, { studentsCount: "desc" }],
  newest: [{ createdAt: "desc" }],
  priceLowHigh: [{ price: "asc" }, { _score: "desc" }],
  priceHighLow: [{ price: "desc" }, { _score: "desc" }],
  ratingHighLow: [{ avgRating: "desc" }, { ratingCount: "desc" }],
  popular: [{ studentsCount: "desc" }, { avgRating: "desc" }],
}

const PRICE_RANGES = [
  { key: "free", to: 0.01 },
  { key: "under500", from: 0.01, to: 500 },
  { key: "500to1000", from: 500, to: 1000 },
  { key: "over1000", from: 1000 },
]

function textQuery(q) {
  return {
    bool: {
      should: [
        { multi_match: { query: q, fields: TEXT_FIELDS, type: "best_fields", fuzziness: "AUTO", prefix_length: 1 } },
        { match_phrase: { courseName: { query: q, boost: 3 } } },
        { match: { "courseName.autocomplete": { query: q, operator: "and", boost: 2 } } },
      ],
      minimum_should_match: 1,
    },
  }
}

function filtersFor({ category, minPrice, maxPrice, minRating }) {
  const filters = []
  if (category) filters.push({ term: { categoryId: String(category) } })
  const price = {}
  if (Number.isFinite(Number(minPrice)) && minPrice !== undefined && minPrice !== "") price.gte = Number(minPrice)
  if (Number.isFinite(Number(maxPrice)) && maxPrice !== undefined && maxPrice !== "") price.lte = Number(maxPrice)
  if (Object.keys(price).length) filters.push({ range: { price } })
  if (Number.isFinite(Number(minRating)) && minRating !== undefined && minRating !== "") {
    filters.push({ range: { avgRating: { gte: Number(minRating) } } })
  }
  return filters
}

// Shapes a hit like the course objects the frontend already renders.
function toCourse(hit) {
  const s = hit._source
  const [firstName = "", ...rest] = (s.instructorName || "").split(" ")
  return {
    _id: hit._id,
    courseName: s.courseName,
    courseDescription: s.courseDescription,
    thumbnail: s.thumbnail,
    price: s.price,
    avgRating: s.avgRating,
    ratingCount: s.ratingCount,
    studentsCount: s.studentsCount,
    createdAt: s.createdAt,
    instructor: { _id: s.instructorId, firstName, lastName: rest.join(" ") },
    category: s.categoryId ? { _id: s.categoryId, name: s.categoryName } : null,
    highlight: hit.highlight
      ? {
          courseName: hit.highlight.courseName?.[0] || hit.highlight["courseName.autocomplete"]?.[0],
        }
      : undefined,
  }
}

async function runSearch(params) {
  const q = typeof params.search === "string" ? params.search.trim().slice(0, 200) : ""
  const page = Math.max(1, parseInt(params.page, 10) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 12))
  const sortBy = SORTS[params.sortBy] ? params.sortBy : q ? "relevance" : "newest"
  const filters = filtersFor(params)

  const query = q
    ? {
        function_score: {
          query: textQuery(q),
          functions: [
            { field_value_factor: { field: "studentsCount", modifier: "log1p", factor: 0.5, missing: 0 } },
            { field_value_factor: { field: "avgRating", modifier: "ln2p", factor: 0.5, missing: 0 } },
          ],
          score_mode: "sum",
          boost_mode: "sum",
        },
      }
    : { match_all: {} }

  const body = {
    query,
    post_filter: { bool: { filter: filters } },
    from: (page - 1) * limit,
    size: limit,
    sort: SORTS[sortBy],
    track_total_hits: true,
    aggs: {
      categories: { terms: { field: "categoryId", size: 30 }, aggs: { name: { terms: { field: "categoryName", size: 1 } } } },
      price: { range: { field: "price", ranges: PRICE_RANGES } },
      rating: { range: { field: "avgRating", ranges: [{ key: "4plus", from: 4 }, { key: "3plus", from: 3 }] } },
    },
    ...(q
      ? {
          // Only the title is highlighted, with a plain (non-fuzzy) query: letting
          // the highlighter reuse the fuzzy query made it expand every fuzzy term
          // against the whole index, ~300 ms of a ~310 ms search on 9k courses
          // (measured with k6, docs/PERFORMANCE.md). Now ~10 ms.
          highlight: {
            pre_tags: ["<mark>"],
            post_tags: ["</mark>"],
            fields: {
              courseName: { number_of_fragments: 0, highlight_query: { match: { courseName: q } } },
              "courseName.autocomplete": { number_of_fragments: 0, highlight_query: { match: { "courseName.autocomplete": { query: q, operator: "and" } } } },
            },
          },
          suggest: { spelling: { text: q, term: { field: "courseName.plain", suggest_mode: "always", min_word_length: 3 } } },
        }
      : {}),
  }

  const res = await es("POST", `/${alias()}/_search`, body)
  const total = res.hits.total.value

  // "Did you mean": replace each misspelt word with its best suggestion.
  let didYouMean = null
  if (q && total === 0 && res.suggest?.spelling?.some((entry) => entry.options.length)) {
    didYouMean = res.suggest.spelling.map((entry) => entry.options[0]?.text || entry.text).join(" ")
  }

  return {
    data: res.hits.hits.map(toCourse),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    facets: {
      categories: res.aggregations.categories.buckets.map((b) => ({
        _id: b.key,
        name: b.name.buckets[0]?.key || "",
        count: b.doc_count,
      })),
      price: res.aggregations.price.buckets.map((b) => ({ key: b.key, count: b.doc_count })),
      rating: res.aggregations.rating.buckets.map((b) => ({ key: b.key, count: b.doc_count })),
    },
    didYouMean,
    sortBy,
    tookMs: res.took,
  }
}

async function runSuggest(prefix) {
  const q = String(prefix || "").trim().slice(0, 100)
  if (!q) return []
  const res = await es("POST", `/${alias()}/_search`, {
    size: 6,
    _source: ["courseName", "thumbnail", "price", "instructorName", "avgRating"],
    query: {
      bool: {
        should: [
          { match: { "courseName.autocomplete": { query: q, operator: "and", boost: 3 } } },
          { match: { courseName: { query: q, fuzziness: "AUTO", prefix_length: 1 } } },
          { match: { "tags.keyword": { query: q.toLowerCase(), boost: 2 } } },
        ],
        minimum_should_match: 1,
      },
    },
    highlight: {
      pre_tags: ["<mark>"],
      post_tags: ["</mark>"],
      fields: { "courseName.autocomplete": { number_of_fragments: 0, highlight_query: { match: { "courseName.autocomplete": { query: q, operator: "and" } } } } },
    },
  })
  return res.hits.hits.map((h) => ({
    _id: h._id,
    courseName: h._source.courseName,
    thumbnail: h._source.thumbnail,
    price: h._source.price,
    instructorName: h._source.instructorName,
    avgRating: h._source.avgRating,
    highlight: h.highlight?.["courseName.autocomplete"]?.[0],
  }))
}

// Behind a circuit breaker: when Elasticsearch is down, callers fail fast and
// use the MongoDB search instead.
const search = withBreaker("elasticsearch-search", runSearch, { timeout: 4000, volumeThreshold: 5, resetTimeout: 15000 })
const suggest = withBreaker("elasticsearch-suggest", runSuggest, { timeout: 2000, volumeThreshold: 5, resetTimeout: 15000 })

module.exports = { search, suggest, textQuery, filtersFor, toCourse, SORTS }
