// Makes each collection's indexes match its schema: creates missing ones and
// drops ones the schema no longer defines (for example a redundant single-field
// index replaced by a compound one). Run during a deploy, because production
// doesn't build indexes at startup (config/mongoose.js).
//   node scripts/syncIndexes.js [--dry-run]      (npm run db:indexes)
require("dotenv").config()
const mongoose = require("../config/mongoose")
const fs = require("fs")
const path = require("path")

async function main() {
  await mongoose.connect(process.env.MONGODB_URL)
  for (const file of fs.readdirSync(path.join(__dirname, "../models"))) require(path.join(__dirname, "../models", file))
  const dryRun = process.argv.includes("--dry-run")
  for (const model of Object.values(mongoose.models)) {
    if (dryRun) {
      const diff = await model.diffIndexes()
      if (diff.toDrop.length || diff.toCreate.length) console.log(model.modelName, diff)
    } else {
      const dropped = await model.syncIndexes()
      if (dropped.length) console.log(`${model.modelName}: dropped ${dropped.join(", ")}`)
    }
  }
  console.log(dryRun ? "dry run complete" : "indexes are in sync")
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
