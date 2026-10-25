// Retrieval evaluation against a small golden set (eval/golden.json).
//   npm run eval            uses MIN_SCORE / TOP_K from the environment
//
// For each question it embeds the query, searches the course WITHOUT a score
// threshold, and records the best score of the expected lecture. It then
// reports, for a range of thresholds:
//   hit@k      answerable questions whose expected lecture is in the top k above the threshold
//   rejected   off-topic questions (expect: null) with nothing above the threshold
// Pick the threshold that keeps hit@k high while rejecting off-topic questions.
// Needs the API (internal routes), Qdrant and an indexed catalog (npm run reindex).
const path = require("path")
const { loadConfig } = require("../src/config")
const { buildServices } = require("../src/index")

async function courseIdsByName(config) {
  const headers = { "X-Internal-Token": config.INTERNAL_API_TOKEN }
  const ids = await (await fetch(`${config.API_INTERNAL_URL}/courses`, { headers })).json()
  const byName = new Map()
  for (const id of ids.data) {
    const content = (await (await fetch(`${config.API_INTERNAL_URL}/courses/${id}/content`, { headers })).json()).data
    byName.set(content.courseName, id)
  }
  return byName
}

async function main() {
  const config = loadConfig()
  const { gemini, qdrant } = buildServices(config)
  const golden = require(path.join(__dirname, "..", "eval", "golden.json"))
  const byName = await courseIdsByName(config)

  const rows = []
  const vectors = await gemini.embed(golden.map((g) => g.question), "RETRIEVAL_QUERY")
  for (const [i, g] of golden.entries()) {
    const courseId = byName.get(g.course)
    if (!courseId) throw new Error(`Course not indexed: ${g.course}`)
    const hits = await qdrant.search(vectors[i], { courseId, limit: config.TOP_K, scoreThreshold: 0 })
    const expected = g.expect && hits.find((h) => h.payload.title === g.expect)
    rows.push({ ...g, top: hits[0]?.score ?? 0, topTitle: hits[0]?.payload.title, expectedScore: expected ? expected.score : null })
  }

  for (const r of rows) {
    const mark = r.expect ? (r.expectedScore != null ? `expected ${r.expectedScore.toFixed(3)}` : "expected MISSING") : "off-topic"
    console.log(`${r.top.toFixed(3)}  ${mark.padEnd(18)}  ${r.question}  -> ${r.topTitle}`)
  }

  const answerable = rows.filter((r) => r.expect)
  const offTopic = rows.filter((r) => !r.expect)
  console.log(`\nthreshold  hit@${config.TOP_K}  rejected`)
  for (const t of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75]) {
    const hit = answerable.filter((r) => r.expectedScore != null && r.expectedScore >= t).length
    const rejected = offTopic.filter((r) => r.top < t).length
    const marker = t === config.MIN_SCORE ? "  <- MIN_SCORE" : ""
    console.log(`${t.toFixed(2).padEnd(9)}  ${`${hit}/${answerable.length}`.padEnd(6)} ${rejected}/${offTopic.length}${marker}`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
