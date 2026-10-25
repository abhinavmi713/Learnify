// Rebuilds the search index for every published course.
//   npm run reindex
// Use after first setup, after changing chunking/embedding settings, or if any
// course.content_changed events were ever missed.
const { loadConfig } = require("../src/config")
const { buildServices } = require("../src/index")

async function main() {
  const config = loadConfig()
  const { qdrant, indexer } = buildServices(config)
  await qdrant.ensureCollection()
  const res = await fetch(`${config.API_INTERNAL_URL}/courses`, { headers: { "X-Internal-Token": config.INTERNAL_API_TOKEN } })
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  const ids = (await res.json()).data
  let chunks = 0
  for (const id of ids) {
    const r = await indexer.indexCourse(id)
    chunks += r.indexed
    console.log(`${id}: ${r.indexed} chunks`)
  }
  console.log(`indexed ${ids.length} courses, ${chunks} chunks`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
