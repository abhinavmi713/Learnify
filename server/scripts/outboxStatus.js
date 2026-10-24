// Shows the most recent outbox events and the delivery backlog.
//   node scripts/outboxStatus.js [limit]      (npm run outbox:status)
require("dotenv").config()
const mongoose = require("mongoose")

async function main() {
  await mongoose.connect(process.env.MONGODB_URL)
  const events = mongoose.connection.collection("outboxevents")
  const limit = Number(process.argv[2]) || 5

  const counts = await events.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray()
  console.log("by status:", Object.fromEntries(counts.map((c) => [c._id, c.n])))

  const rows = await events.find({}).sort({ createdAt: -1 }).limit(limit).toArray()
  for (const r of rows) {
    const payload = JSON.stringify(r.payload).slice(0, 40)
    console.log(`${r.type.padEnd(26)} ${r.status.padEnd(10)} attempts=${r.attempts} payload=${payload}${r.lastError ? `  error="${r.lastError}"` : ""}`)
  }
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
