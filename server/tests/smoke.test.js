const mongoose = require("mongoose")
const { MongoMemoryServer } = require("mongodb-memory-server")

let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

test("in-memory MongoDB connects and can read/write a document", async () => {
  const Ping = mongoose.model("Ping", new mongoose.Schema({ ok: Boolean }))
  await Ping.create({ ok: true })
  const found = await Ping.findOne({ ok: true })
  expect(found.ok).toBe(true)
})
