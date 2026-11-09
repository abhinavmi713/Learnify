// Puts outbox events the relay gave up on back in the queue, after the cause
// (usually a long broker outage) has been fixed.
//   node scripts/outboxRequeue.js [--dry-run]      (npm run outbox:requeue)
require("dotenv").config()
const mongoose = require("mongoose")

async function main() {
  await mongoose.connect(process.env.MONGODB_URL)
  const events = mongoose.connection.collection("outboxevents")
  const failed = await events.countDocuments({ status: "failed" })
  if (process.argv.includes("--dry-run")) {
    console.log(`${failed} failed event(s) would be requeued`)
  } else {
    const result = await events.updateMany(
      { status: "failed" },
      { $set: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lockedAt: null } }
    )
    console.log(`requeued ${result.modifiedCount} event(s)`)
  }
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
