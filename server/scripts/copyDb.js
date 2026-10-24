// Copies every collection (documents and indexes) from one MongoDB to another.
//
//   SRC=mongodb://127.0.0.1:27017/learnify \
//   DEST="mongodb://127.0.0.1:27018/learnify?directConnection=true" \
//   npm run db:copy
//
// Used to move a local standalone database into the docker-compose replica set.
// Refuses to write into a destination that already has data unless FORCE=1.
// Does not modify the source.
const { MongoClient } = require("mongodb")

const SRC = process.env.SRC
const DEST = process.env.DEST

async function main() {
  if (!SRC || !DEST) {
    console.error("Set SRC and DEST connection strings.")
    process.exit(1)
  }
  const src = await MongoClient.connect(SRC)
  const dest = await MongoClient.connect(DEST)
  try {
    const from = src.db()
    const to = dest.db()
    const collections = await from.listCollections({}, { nameOnly: true }).toArray()

    const existing = await to.listCollections({}, { nameOnly: true }).toArray()
    if (existing.length && process.env.FORCE !== "1") {
      console.error(`Destination already has ${existing.length} collections. Set FORCE=1 to overwrite them.`)
      process.exit(1)
    }

    for (const { name } of collections) {
      if (name.startsWith("system.")) continue
      const docs = await from.collection(name).find({}).toArray()
      await to.collection(name).deleteMany({})
      if (docs.length) await to.collection(name).insertMany(docs)

      // Recreate secondary indexes (the _id index already exists).
      const indexes = (await from.collection(name).indexes()).filter((i) => i.name !== "_id_")
      for (const { key, name: indexName, v, ns, ...options } of indexes) {
        await to.collection(name).createIndex(key, { name: indexName, ...options })
      }
      console.log(`${name}: ${docs.length} documents, ${indexes.length} indexes`)
    }
  } finally {
    await src.close()
    await dest.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
