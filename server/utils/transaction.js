const mongoose = require("mongoose")
const logger = require("./logger")

// MongoDB reports this when the server is a standalone (not a replica set),
// where multi-document transactions do not exist.
const isTransactionUnsupported = (error) =>
  error?.code === 20 || /Transaction numbers are only allowed on a replica set/i.test(error?.message || "")

// Runs `work(session)` inside a transaction so every write in it commits or none
// does. `work` may be re-run on a transient error, so it must not perform
// external side effects (send mail, call APIs) itself: that is what the outbox
// event written inside it is for.
//
// On a standalone MongoDB (a developer's local mongod without a replica set) it
// warns and runs `work(null)` without a session, so the app still works, but
// nothing is atomic. Production refuses: losing atomicity there must be loud.
async function runInTransaction(work) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await work(session)
    })
    return result
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      if (process.env.NODE_ENV === "production") throw error
      logger.warn("MongoDB is not a replica set: running WITHOUT a transaction")
      return work(null)
    }
    throw error
  } finally {
    await session.endSession()
  }
}

module.exports = { runInTransaction }
