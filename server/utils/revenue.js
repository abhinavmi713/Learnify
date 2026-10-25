const Course = require("../models/Course")
const PaymentRecord = require("../models/PaymentRecord")

// Revenue is what was actually collected (PaymentRecord.amount, after coupons),
// not list price x students. Refunded or refund-pending orders do not count.
// (Plain equality, not $in with null: matching null forces MongoDB to fetch
// every document, so the {status, createdAt, amount} index could not cover it.)
const COLLECTED = { status: "fulfilled" }

// Splits each order's amount across the courses it contained, in proportion to
// their list prices (an order with a coupon pays less for every course in it).
// Returns Map<courseId, rupees>.
async function revenueByCourse() {
  const records = await PaymentRecord.find(COLLECTED, { amount: 1, courses: 1 }).lean()
  const courseIds = [...new Set(records.flatMap((r) => r.courses.map(String)))]
  const prices = new Map(
    (await Course.find({ _id: { $in: courseIds } }, { price: 1 }).lean()).map((c) => [String(c._id), c.price || 0])
  )

  const byCourse = new Map()
  for (const record of records) {
    if (!record.amount) continue
    const ids = record.courses.map(String)
    const listTotal = ids.reduce((sum, id) => sum + (prices.get(id) || 0), 0)
    for (const id of ids) {
      const share = listTotal > 0 ? (prices.get(id) || 0) / listTotal : 1 / ids.length
      byCourse.set(id, (byCourse.get(id) || 0) + record.amount * share)
    }
  }
  for (const [id, value] of byCourse) byCourse.set(id, Math.round(value))
  return byCourse
}

async function totalRevenue() {
  const [row] = await PaymentRecord.aggregate([{ $match: COLLECTED }, { $group: { _id: null, total: { $sum: "$amount" } } }])
  return row?.total || 0
}

// Collected revenue per month for the given month keys ("YYYY-MM").
async function revenueByMonth(monthKeys) {
  // Covered by the {status, createdAt, amount} index: no documents are read.
  const records = await PaymentRecord.find(COLLECTED, { _id: 0, amount: 1, createdAt: 1 }).lean()
  const byMonth = new Map(monthKeys.map((k) => [k, 0]))
  for (const r of records) {
    const d = new Date(r.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (byMonth.has(key)) byMonth.set(key, byMonth.get(key) + (r.amount || 0))
  }
  return monthKeys.map((month) => ({ month, amount: byMonth.get(month) || 0 }))
}

module.exports = { revenueByCourse, totalRevenue, revenueByMonth }
