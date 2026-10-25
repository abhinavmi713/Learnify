// Measures the app's hot MongoDB queries with explain("executionStats") on a
// synthetic dataset, before and after the compound indexes declared in the
// models, and prints a table (see docs/PERFORMANCE.md).
//
//   npm run perf:explain
//
// Uses a throwaway database (<your db>_explain) on the same server and drops it
// at the end; your real data is never touched.
require("dotenv").config({ quiet: true })
const { MongoClient, ObjectId } = require("mongodb")

const COURSES = 20000
const USERS = 20000
const PROGRESS = 200000
const NOTIFICATIONS = 200000
const PAYMENTS = 50000

function explainDbUrl(url) {
  const u = new URL(url)
  const name = (u.pathname.replace(/^\//, "") || "learnify") + "_explain"
  u.pathname = `/${name}`
  return { url: u.toString(), name }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

async function seed(db) {
  const instructors = Array.from({ length: 300 }, () => new ObjectId())
  const users = Array.from({ length: USERS }, () => new ObjectId())
  const statuses = ["Published", "Published", "Published", "Draft", "Pending", "Rejected"]
  const courseIds = []
  const courses = Array.from({ length: COURSES }, (_, i) => {
    const _id = new ObjectId()
    courseIds.push(_id)
    return {
      _id,
      courseName: `Course ${i}`,
      instructor: pick(instructors),
      status: pick(statuses),
      deletedAt: Math.random() < 0.05 ? new Date() : null,
      price: Math.floor(Math.random() * 2000),
      createdAt: new Date(Date.now() - Math.random() * 3e10),
    }
  })
  await db.collection("courses").insertMany(courses)
  const batches = async (name, total, make) => {
    for (let i = 0; i < total; i += 10000) {
      await db.collection(name).insertMany(Array.from({ length: Math.min(10000, total - i) }, make))
    }
  }
  await batches("courseprogresses", PROGRESS, () => ({
    courseID: pick(courseIds),
    userId: pick(users),
    completedVideos: [],
    createdAt: new Date(Date.now() - Math.random() * 3e10),
  }))
  await batches("notifications", NOTIFICATIONS, () => ({
    user: pick(users),
    read: Math.random() < 0.7,
    message: "x",
    createdAt: new Date(Date.now() - Math.random() * 3e10),
  }))
  await batches("paymentrecords", PAYMENTS, () => ({
    user: pick(users),
    status: pick(["fulfilled", "fulfilled", "fulfilled", "refunded", "refund_pending"]),
    amount: Math.floor(Math.random() * 2000),
    createdAt: new Date(Date.now() - Math.random() * 3e10),
  }))
  return { user: users[0], instructor: instructors[0] }
}

// The queries, as the controllers issue them.
function queries(db, { user, instructor }) {
  return [
    ["catalog: published, newest first", () => db.collection("courses").find({ status: "Published", deletedAt: null }).sort({ createdAt: -1 }).limit(24)],
    ["moderation queue: pending, newest first", () => db.collection("courses").find({ status: "Pending" }).sort({ createdAt: -1 }).limit(50)],
    ["instructor's courses", () => db.collection("courses").find({ instructor, deletedAt: null })],
    ["student's progress (profile stats)", () => db.collection("courseprogresses").find({ userId: user })],
    ["notification feed", () => db.collection("notifications").find({ user }).sort({ createdAt: -1 }).limit(30)],
    ["unread notification count", () => db.collection("notifications").find({ user, read: false })],
    ["revenue: collected payments", () => db.collection("paymentrecords").find({ status: "fulfilled" }, { projection: { _id: 0, amount: 1, createdAt: 1 } })],
  ]
}

// The compound indexes added to the models.
const INDEXES = {
  // Equality, Sort, Range: status (equality) then createdAt (sort), with
  // deletedAt last so one index serves the catalog and the moderation queue.
  courses: [{ status: 1, createdAt: -1, deletedAt: 1 }, { instructor: 1, deletedAt: 1 }],
  courseprogresses: [{ userId: 1 }],
  notifications: [{ user: 1, createdAt: -1 }, { user: 1, read: 1 }],
  // Covering index: holds every field the revenue query reads, so MongoDB never
  // fetches the documents (an ordinary index on a low-selectivity status is
  // slower than a collection scan).
  paymentrecords: [{ status: 1, createdAt: 1, amount: 1 }],
}

function summarize(explain) {
  const s = explain.executionStats
  const stages = []
  const walk = (stage) => {
    if (!stage) return
    stages.push(stage.stage)
    walk(stage.inputStage)
    ;(stage.inputStages || []).forEach(walk)
  }
  walk(explain.queryPlanner.winningPlan.queryPlan || explain.queryPlanner.winningPlan)
  return {
    plan: stages.filter((x) => ["COLLSCAN", "IXSCAN", "SORT", "FETCH", "PROJECTION_COVERED"].includes(x)).join(">"),
    keys: s.totalKeysExamined,
    docs: s.totalDocsExamined,
    returned: s.nReturned,
    ms: s.executionTimeMillis,
  }
}

async function measure(db, context) {
  const out = []
  for (const [name, make] of queries(db, context)) {
    out.push([name, summarize(await make().explain("executionStats"))])
  }
  return out
}

async function main() {
  const { url, name } = explainDbUrl(process.env.MONGODB_URL)
  const client = await MongoClient.connect(url)
  const db = client.db(name)
  try {
    await db.dropDatabase()
    console.log(`seeding ${COURSES} courses, ${PROGRESS} progress rows, ${NOTIFICATIONS} notifications, ${PAYMENTS} payments...`)
    const context = await seed(db)
    // Indexes that existed before this change.
    await db.collection("courseprogresses").createIndex({ courseID: 1, userId: 1 })
    await db.collection("notifications").createIndex({ user: 1 })
    await db.collection("paymentrecords").createIndex({ user: 1 })

    const before = await measure(db, context)
    for (const [coll, specs] of Object.entries(INDEXES)) {
      for (const spec of specs) await db.collection(coll).createIndex(spec)
    }
    const after = await measure(db, context)

    const fmt = (r) => `${r.plan} keys=${r.keys} docs=${r.docs} ${r.ms}ms`
    console.log("\n| Query | Before | After |\n|---|---|---|")
    before.forEach(([q, b], i) => console.log(`| ${q} | ${fmt(b)} | ${fmt(after[i][1])} |`))
  } finally {
    await db.dropDatabase().catch(() => {})
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
