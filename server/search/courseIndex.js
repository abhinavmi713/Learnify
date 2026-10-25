const mongoose = require("mongoose")
const Course = require("../models/Course")
// Registered for populate() in buildDocument.
require("../models/User")
require("../models/Category")
require("../models/RatingandReview")
require("../models/Section")
require("../models/Subsection")
const { es, isConfigured } = require("../config/elasticsearch")
const logger = require("../utils/logger")

// The application always talks to the alias "courses". Each full rebuild
// creates a new physical index (courses_<timestamp>), fills it, and swaps the
// alias in one atomic call, so searches never see a half-built index and a
// mapping change needs no downtime.
// Read on each use so tests can point at their own alias.
const alias = () => process.env.ELASTICSEARCH_INDEX || "courses"

const settings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    filter: {
      // "jav" -> matches "javascript": prefixes of each word, 2 to 20 characters.
      autocomplete_ngram: { type: "edge_ngram", min_gram: 2, max_gram: 20 },
      english_stop: { type: "stop", stopwords: "_english_" },
      english_stemmer: { type: "stemmer", language: "english" },
      english_possessive_stemmer: { type: "stemmer", language: "possessive_english" },
    },
    analyzer: {
      autocomplete_index: {
        type: "custom",
        tokenizer: "standard",
        filter: ["lowercase", "asciifolding", "autocomplete_ngram"],
      },
      // The query side is NOT n-grammed, or "react" would also match "re..." words.
      autocomplete_search: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding"] },
      // Stemming: "functions" matches "function", "learning" matches "learn".
      english_folded: {
        type: "custom",
        tokenizer: "standard",
        filter: ["lowercase", "asciifolding", "english_possessive_stemmer", "english_stop", "english_stemmer"],
      },
    },
  },
}

const mappings = {
  dynamic: "strict",
  properties: {
    courseName: {
      type: "text",
      analyzer: "english_folded",
      fields: {
        autocomplete: { type: "text", analyzer: "autocomplete_index", search_analyzer: "autocomplete_search" },
        keyword: { type: "keyword", ignore_above: 256 },
        // Unstemmed words, for "did you mean" spelling suggestions.
        plain: { type: "text", analyzer: "standard" },
      },
    },
    courseDescription: { type: "text", analyzer: "english_folded" },
    whatYouWillLearn: { type: "text", analyzer: "english_folded" },
    lectureTitles: { type: "text", analyzer: "english_folded" },
    tags: { type: "text", analyzer: "english_folded", fields: { keyword: { type: "keyword" } } },
    instructorName: { type: "text", fields: { keyword: { type: "keyword" } } },
    instructorId: { type: "keyword" },
    categoryId: { type: "keyword" },
    categoryName: { type: "keyword" },
    price: { type: "float" },
    avgRating: { type: "float" },
    ratingCount: { type: "integer" },
    studentsCount: { type: "integer" },
    createdAt: { type: "date" },
    thumbnail: { type: "keyword", index: false },
  },
}

// Search document for one course, or null if it must not be searchable.
async function buildDocument(courseId) {
  if (!mongoose.isValidObjectId(courseId)) return null
  const course = await Course.findById(courseId)
    .populate("instructor", "firstName lastName")
    .populate("category", "name")
    .populate("ratingAndReviews", "rating")
    .populate({ path: "courseContent", select: "subSection", populate: { path: "subSection", select: "title" } })
    .lean()
  if (!course || course.status !== "Published" || course.deletedAt) return null

  const ratings = (course.ratingAndReviews || []).map((r) => r.rating).filter((r) => typeof r === "number")
  return {
    courseName: course.courseName,
    courseDescription: course.courseDescription || "",
    whatYouWillLearn: course.whatYouWillLearn || "",
    lectureTitles: (course.courseContent || []).flatMap((s) => (s.subSection || []).map((l) => l.title)),
    tags: course.tag || [],
    instructorName: course.instructor ? `${course.instructor.firstName} ${course.instructor.lastName}` : "",
    instructorId: course.instructor ? String(course.instructor._id) : null,
    categoryId: course.category ? String(course.category._id) : null,
    categoryName: course.category?.name || null,
    price: course.price || 0,
    avgRating: ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : 0,
    ratingCount: ratings.length,
    studentsCount: (course.studentsEnroled || []).length,
    createdAt: course.createdAt,
    thumbnail: course.thumbnail || "",
  }
}

async function aliasTargets() {
  try {
    return Object.keys(await es("GET", `/_alias/${alias()}`))
  } catch (error) {
    if (error.status === 404) return []
    throw error
  }
}

async function createIndex() {
  const name = `${alias()}_${Date.now()}`
  await es("PUT", `/${name}`, { settings, mappings })
  return name
}

// Makes sure the alias exists (first start). Safe to call repeatedly.
async function ensureIndex() {
  if ((await aliasTargets()).length) return
  const name = await createIndex()
  await es("POST", "/_aliases", { actions: [{ add: { index: name, alias: alias() } }] })
  logger.info({ index: name }, "created search index")
}

// Brings one course's search document up to date (or removes it).
async function indexCourse(courseId) {
  const doc = await buildDocument(courseId)
  if (!doc) {
    try {
      await es("DELETE", `/${alias()}/_doc/${courseId}`)
    } catch (error) {
      if (error.status !== 404) throw error
    }
    return { removed: true }
  }
  await es("PUT", `/${alias()}/_doc/${courseId}`, doc)
  return { indexed: true }
}

// Full rebuild into a fresh index, then an atomic alias swap. Used by
// `npm run search:reindex` and after mapping changes.
async function rebuild() {
  const name = await createIndex()
  const ids = await Course.find({ status: "Published", deletedAt: null }).distinct("_id")
  let count = 0
  for (let i = 0; i < ids.length; i += 200) {
    const lines = []
    for (const id of ids.slice(i, i + 200)) {
      const doc = await buildDocument(id)
      if (!doc) continue
      lines.push(JSON.stringify({ index: { _index: name, _id: String(id) } }), JSON.stringify(doc))
      count++
    }
    if (lines.length) {
      const res = await es("POST", "/_bulk", `${lines.join("\n")}\n`, { ndjson: true, timeoutMs: 30000 })
      if (res.errors) throw new Error(`bulk indexing failed: ${JSON.stringify(res.items.find((it) => it.index?.error))}`)
    }
  }
  await es("POST", `/${name}/_refresh`)

  const old = await aliasTargets()
  await es("POST", "/_aliases", {
    actions: [...old.map((index) => ({ remove: { index, alias: alias() } })), { add: { index: name, alias: alias() } }],
  })
  for (const index of old) await es("DELETE", `/${index}`).catch(() => {})
  return { index: name, count, replaced: old }
}

// Called at startup: registers the health check and creates the index on first
// run. Never blocks or fails startup; search falls back to MongoDB meanwhile.
function bootstrapSearch() {
  if (!isConfigured()) return
  require("../config/elasticsearch").registerHealth()
  ensureIndex().catch((error) => logger.warn({ err: error.message }, "could not prepare the search index; using MongoDB search"))
}

module.exports = { bootstrapSearch, alias, settings, mappings, buildDocument, ensureIndex, indexCourse, rebuild, isConfigured }
