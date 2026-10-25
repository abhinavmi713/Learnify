// Rebuilds the course search index from MongoDB into a fresh index and swaps the
// alias atomically (no downtime).
//   npm run search:reindex
// Use after first setup, after changing the mapping in search/courseIndex.js,
// or to repair the index after missed events.
require("dotenv").config({ quiet: true })
const mongoose = require("mongoose")
const { isConfigured } = require("../config/elasticsearch")
const { rebuild } = require("../search/courseIndex")

async function main() {
  if (!isConfigured()) throw new Error("ELASTICSEARCH_URL is not set")
  await mongoose.connect(process.env.MONGODB_URL)
  const started = Date.now()
  const result = await rebuild()
  console.log(
    `indexed ${result.count} courses into ${result.index} in ${Date.now() - started} ms` +
      (result.replaced.length ? ` (replaced ${result.replaced.join(", ")})` : "")
  )
  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
