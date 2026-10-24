const mongoose = require("mongoose")
const { MongoMemoryServer } = require("mongodb-memory-server")

let mongod

// Shared per-test-file lifecycle: one in-memory MongoDB instance, dropped
// clean between tests so nothing leaks across test cases within a file.
//
// It runs as a single-node replica set because multi-document transactions
// (used by enrollment/payment fulfilment and the outbox) need one. The set is
// initiated with mongoose's own driver: the older driver bundled inside
// mongodb-memory-server's MongoMemoryReplSet is rejected by recent mongod
// binaries ("Missing required sub-document 'driver'").
async function startTestDb() {
  mongod = await MongoMemoryServer.create({ instance: { args: ["--replSet", "rs0"] } })
  const port = mongod.instanceInfo.port
  const directUri = `mongodb://127.0.0.1:${port}/test?directConnection=true`

  const admin = await mongoose.createConnection(directUri).asPromise()
  try {
    await admin.db.admin().command({
      replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: `127.0.0.1:${port}` }] },
    })
    // Wait for the election so the first write doesn't hit "not primary".
    for (let i = 0; i < 100; i++) {
      const hello = await admin.db.admin().command({ hello: 1 })
      if (hello.isWritablePrimary) break
      await new Promise((r) => setTimeout(r, 100))
    }
  } finally {
    await admin.close()
  }

  await mongoose.connect(directUri)
  // Model indexes build in the background; tests that rely on unique indexes
  // (duplicate email, one PaymentRecord per order) must not race them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()))
}

async function stopTestDb() {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  await mongod.stop()
}

async function clearTestDb() {
  const collections = mongoose.connection.collections
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})))
}

module.exports = { startTestDb, stopTestDb, clearTestDb }
