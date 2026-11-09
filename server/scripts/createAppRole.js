// Creates a database role for the Learnify API and worker that can read and write
// every collection but can only INSERT into the audit log (never update or delete
// it), plus a user with that role. Connecting the app as this user makes the audit
// log append-only even against the native driver or a shell using its credentials.
//
//   MONGODB_ADMIN_URL=<url of a user allowed to create roles> \
//   APP_DB_USER=learnify_app APP_DB_PASSWORD=<long password> \
//   node scripts/createAppRole.js [database=learnify]          (npm run db:app-role)
//
// Then use APP_DB_USER/APP_DB_PASSWORD in MONGODB_URL. Old audit entries still
// expire through the TTL index: MongoDB's TTL monitor isn't limited by user roles.
//
// MongoDB Atlas doesn't allow createRole from a client. There, create the same
// role under Database Access > Custom Roles: on the database, Find, Insert,
// Create Collection, Create Index, Drop Index, List Indexes, List Collections,
// Coll Stats; plus Update and Remove on every collection except auditlogs.
require("dotenv").config({ quiet: true })
const mongoose = require("mongoose")
const path = require("path")
const fs = require("fs")

const ROLE = "learnifyApp"
const AUDIT_COLLECTION = "auditlogs"

// Every collection the models use, from the model files themselves.
function appCollections() {
  const dir = path.join(__dirname, "..", "models")
  for (const file of fs.readdirSync(dir)) if (file.endsWith(".js")) require(path.join(dir, file))
  return Object.values(mongoose.models).map((m) => m.collection.collectionName)
}

function rolePrivileges(db, collections) {
  return [
    // Everything, including the audit log: read, insert, manage indexes.
    {
      resource: { db, collection: "" },
      actions: ["find", "insert", "createCollection", "createIndex", "dropIndex", "listIndexes", "listCollections", "collStats", "dbStats"],
    },
    // Changing and removing documents: every collection except the audit log.
    ...collections
      .filter((name) => name !== AUDIT_COLLECTION)
      .map((collection) => ({ resource: { db, collection }, actions: ["update", "remove"] })),
  ]
}

async function main() {
  const adminUrl = process.env.MONGODB_ADMIN_URL
  const user = process.env.APP_DB_USER
  const password = process.env.APP_DB_PASSWORD
  const dbName = process.argv[2] || "learnify"
  if (!adminUrl || !user || !password) {
    throw new Error("Set MONGODB_ADMIN_URL, APP_DB_USER and APP_DB_PASSWORD")
  }
  const collections = [...new Set(appCollections())].sort()
  const conn = await mongoose.createConnection(adminUrl).asPromise()
  const db = conn.useDb(dbName).db
  const privileges = rolePrivileges(dbName, collections)
  const existing = await db.command({ rolesInfo: ROLE })
  if (existing.roles.length) await db.command({ updateRole: ROLE, privileges, roles: [] })
  else await db.command({ createRole: ROLE, privileges, roles: [] })
  const users = await db.command({ usersInfo: user })
  if (users.users.length) await db.command({ updateUser: user, pwd: password, roles: [{ role: ROLE, db: dbName }] })
  else await db.command({ createUser: user, pwd: password, roles: [{ role: ROLE, db: dbName }] })
  console.log(`role ${ROLE} and user ${user} ready on ${dbName} (${collections.length} collections; ${AUDIT_COLLECTION} is insert-only)`)
  await conn.close()
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = { rolePrivileges, appCollections }
