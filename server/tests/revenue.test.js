const Course = require("../models/Course")
const PaymentRecord = require("../models/PaymentRecord")
const { revenueByCourse, totalRevenue, revenueByMonth } = require("../utils/revenue")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)
afterAll(async () => {
  await stopTestDb()
})
afterEach(async () => {
  await clearTestDb()
})

async function course(instructor, name, price) {
  return Course.create({
    courseName: name, courseDescription: "d", instructor: instructor._id, whatYouWillLearn: "w",
    price, tag: ["t"], thumbnail: "http://x/t.jpg", instructions: ["i"], status: "Published", courseContent: [],
  })
}

test("revenue is what was collected (after coupons), split by list price, refunds excluded", async () => {
  const instructor = await createUser({ email: "i@example.com", accountType: "Instructor" })
  const student = await createUser({ email: "s@example.com" })
  const js = await course(instructor, "JS", 500)
  const py = await course(instructor, "PY", 1500)

  // One order for both courses with a 20% coupon: ₹2000 list, ₹1600 paid.
  await PaymentRecord.create({ orderId: "o1", user: student._id, courses: [js._id, py._id], amount: 1600, source: "verify" })
  // A free enrolment and a refunded order must not count.
  await PaymentRecord.create({ orderId: "o2", user: student._id, courses: [js._id], amount: 0, source: "free" })
  await PaymentRecord.create({ orderId: "o3", user: student._id, courses: [py._id], amount: 1500, source: "verify", status: "refunded" })

  const byCourse = await revenueByCourse()
  expect(byCourse.get(String(js._id))).toBe(400) // 1600 * 500/2000
  expect(byCourse.get(String(py._id))).toBe(1200) // 1600 * 1500/2000
  expect(await totalRevenue()).toBe(1600)

  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  expect(await revenueByMonth([key])).toEqual([{ month: key, amount: 1600 }])
})
