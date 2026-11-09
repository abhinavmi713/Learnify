// Regression tests for the third round of fixes, plus coverage for flows that had
// little (password reset, course progress, certificates). Each block names the
// bug it guards.
process.env.RAZORPAY_SECRET = "test_razorpay_secret"
process.env.TRUST_PROXY = "1" // so X-Forwarded-For sets req.ip (M35)

jest.mock("../utils/mailSender", () => jest.fn().mockResolvedValue({ response: "mocked" }))
const mockOrders = { create: jest.fn(), fetch: jest.fn() }
const mockPayments = { fetch: jest.fn(), capture: jest.fn(), refund: jest.fn(), fetchMultipleRefund: jest.fn() }
jest.mock("../config/razorpay", () => ({ getInstance: () => ({ orders: mockOrders, payments: mockPayments }) }))

const crypto = require("crypto")
const request = require("supertest")
const mongoose = require("mongoose")
const app = require("../app")
const AuditLog = require("../models/AuditLog")
const Certificate = require("../models/Certificate")
const Coupon = require("../models/Coupon")
const Course = require("../models/Course")
const CourseProgress = require("../models/CourseProgress")
const PaymentRecord = require("../models/PaymentRecord")
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const User = require("../models/User")
const { handleRefund } = require("../workers/handlers/refund")
const { ensureIndexes } = require("../utils/ensureIndexes")
const { resetLocalBuckets } = require("../utils/tokenBucket")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)
afterAll(async () => {
  await stopTestDb()
})
afterEach(async () => {
  await clearTestDb()
  jest.restoreAllMocks()
  Object.values(mockOrders).forEach((m) => m.mockReset())
  Object.values(mockPayments).forEach((m) => m.mockReset())
  resetLocalBuckets()
  delete process.env.RATE_LIMIT_IN_TESTS
})

let n = 0
const student = () => createUser({ email: `s${++n}@example.com` })
const instructor = () => createUser({ email: `i${++n}@example.com`, accountType: "Instructor" })
const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` })
const hmac = (payload) => crypto.createHmac("sha256", "test_razorpay_secret").update(payload).digest("hex")

// A published course with `lectures` lectures in one section.
async function courseWithLectures(owner, lectures = 2, extra = {}) {
  const subs = await SubSection.insertMany(Array.from({ length: lectures }, (_, i) => ({ title: `L${i}`, videoUrl: "https://example.com/v.mp4" })))
  const section = await Section.create({ sectionName: "S", subSection: subs.map((s) => s._id) })
  const course = await Course.create({ courseName: "C", instructor: owner._id, status: "Published", thumbnail: "t", price: 500, courseContent: [section._id], ...extra })
  return { course, lectures: subs }
}
async function enroll(user, course) {
  await Course.updateOne({ _id: course._id }, { $addToSet: { studentsEnroled: user._id } })
  await CourseProgress.create({ courseID: course._id, userId: user._id, completedVideos: [] })
}
const progress = (user, courseId, subsectionId) =>
  request(app).post("/api/v1/course/updateCourseProgress").set(auth(user)).send({ courseId: String(courseId), subsectionId: String(subsectionId) })

describe("M44: lectures from another course don't count", () => {
  test("a lecture outside the course is refused, so it can't earn the certificate", async () => {
    const owner = await instructor()
    const { course } = await courseWithLectures(owner, 2)
    const other = await courseWithLectures(owner, 2)
    const learner = await student()
    await enroll(learner, course)

    for (const lecture of other.lectures) {
      const res = await progress(learner, course._id, lecture._id)
      expect(res.status).toBe(404)
    }
    expect(await Certificate.countDocuments({ user: learner._id })).toBe(0)
  })

  test("foreign ids already in the list are ignored when checking for a certificate", async () => {
    const owner = await instructor()
    const { course, lectures } = await courseWithLectures(owner, 2)
    const other = await courseWithLectures(owner, 2)
    const learner = await student()
    await enroll(learner, course)
    await CourseProgress.updateOne({ courseID: course._id, userId: learner._id }, { $set: { completedVideos: other.lectures.map((l) => l._id) } })

    const first = await progress(learner, course._id, lectures[0]._id)
    expect(first.body.certificateIssued).toBe(false)
    const last = await progress(learner, course._id, lectures[1]._id)
    expect(last.body.certificateIssued).toBe(true)
  })
})

describe("L57: course progress", () => {
  test("a student who isn't enrolled has no progress to update", async () => {
    const { course, lectures } = await courseWithLectures(await instructor(), 1)
    expect((await progress(await student(), course._id, lectures[0]._id)).status).toBe(404)
  })

  test("the same lecture can't be completed twice", async () => {
    const { course, lectures } = await courseWithLectures(await instructor(), 2)
    const learner = await student()
    await enroll(learner, course)
    expect((await progress(learner, course._id, lectures[0]._id)).status).toBe(200)
    expect((await progress(learner, course._id, lectures[0]._id)).status).toBe(400)
  })
})

describe("L57: certificates", () => {
  async function earned() {
    const { course, lectures } = await courseWithLectures(await instructor(), 1)
    const learner = await student()
    await enroll(learner, course)
    await progress(learner, course._id, lectures[0]._id)
    const certificate = await Certificate.findOne({ user: learner._id })
    return { learner, certificate }
  }

  test("only its owner can download it, as a PDF", async () => {
    const { learner, certificate } = await earned()
    const own = await request(app).get(`/api/v1/certificate/download/${certificate.certificateId}`).set(auth(learner)).buffer(true)
    expect(own.status).toBe(200)
    expect(own.headers["content-type"]).toBe("application/pdf")
    expect(own.body.subarray(0, 5).toString()).toBe("%PDF-")

    const stranger = await request(app).get(`/api/v1/certificate/download/${certificate.certificateId}`).set(auth(await student()))
    expect(stranger.status).toBe(403)
  })

  test("anyone can verify it, without logging in", async () => {
    const { certificate } = await earned()
    const res = await request(app).get(`/api/v1/certificate/verify/${certificate.certificateId}`)
    expect(res.body.valid).toBe(true)
    expect((await request(app).get("/api/v1/certificate/verify/nope")).status).toBe(404)
  })
})

describe("L57: password reset", () => {
  const ask = (email) => request(app).post("/api/v1/auth/reset-password-token").send({ email })
  const reset = (token, password = "N3w-Password!") =>
    request(app).post("/api/v1/auth/reset-password").send({ token, password, confirmPassword: password })

  async function tokenFor_(user, { expired = false } = {}) {
    const raw = crypto.randomBytes(32).toString("hex")
    await User.updateOne(
      { _id: user._id },
      { resetPasswordToken: crypto.createHash("sha256").update(raw).digest("hex"), resetPasswordExpires: Date.now() + (expired ? -1000 : 60000) }
    )
    return raw
  }

  test("the answer is the same for an unknown email, and only a hash is stored", async () => {
    const user = await student()
    const known = await ask(user.email)
    const unknown = await ask("nobody@example.com")
    expect(known.body).toEqual(unknown.body)
    const stored = await User.findById(user._id).select("+resetPasswordToken")
    expect(stored.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/)
  })

  test("a token works once, changes the password and ends old sessions", async () => {
    const user = await student()
    const raw = await tokenFor_(user)
    const before = (await User.findById(user._id)).tokenVersion || 0
    expect((await reset(raw)).status).toBe(200)
    expect((await reset(raw)).status).toBe(400)
    const after = await User.findById(user._id)
    expect(after.tokenVersion).toBe(before + 1)
    const login = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: "N3w-Password!" })
    expect(login.status).toBe(200)
  })

  test("an expired or wrong token is refused", async () => {
    const user = await student()
    expect((await reset(await tokenFor_(user, { expired: true }))).status).toBe(403)
    expect((await reset("0".repeat(64))).status).toBe(400)
  })
})

describe("M17: a coupon's limit holds under concurrent checkouts", () => {
  test("five shoppers, one use: one order", async () => {
    const owner = await instructor()
    const { course } = await courseWithLectures(owner, 1)
    await Coupon.create({ code: "ONCE", discountType: "percentage", discountValue: 10, maxUses: 1 })
    mockOrders.create.mockImplementation(async ({ amount }) => ({ id: `order_${crypto.randomUUID()}`, amount }))
    const shoppers = await Promise.all(Array.from({ length: 5 }, () => student()))

    const results = await Promise.all(
      shoppers.map((s) => request(app).post("/api/v1/payment/capturePayment").set(auth(s)).send({ courses: [String(course._id)], couponCode: "ONCE" }))
    )
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(results.filter((r) => r.status === 400).every((r) => /usage limit/.test(r.body.message))).toBe(true)
    expect(mockOrders.create).toHaveBeenCalledTimes(1)
  })

  test("an expired reservation frees the use, and paying turns it into a use", async () => {
    const { course } = await courseWithLectures(await instructor(), 1)
    await Coupon.create({ code: "ONCE", discountType: "flat", discountValue: 100, maxUses: 1 })
    mockOrders.create.mockImplementation(async ({ amount, notes }) => ({ id: "order_r", amount, notes }))
    const first = await student()
    const second = await student()
    expect((await request(app).post("/api/v1/payment/capturePayment").set(auth(first)).send({ courses: [String(course._id)], couponCode: "ONCE" })).status).toBe(200)
    await Coupon.updateOne({ code: "ONCE" }, { $set: { "reservations.0.expiresAt": new Date(Date.now() - 1000) } })
    expect((await request(app).post("/api/v1/payment/capturePayment").set(auth(second)).send({ courses: [String(course._id)], couponCode: "ONCE" })).status).toBe(200)

    // The second shopper pays: the reservation becomes the coupon's one use.
    mockOrders.fetch.mockResolvedValue({ id: "order_r", amount: 40000, notes: { userId: String(second._id), courses: String(course._id), couponCode: "ONCE" } })
    mockPayments.fetch.mockResolvedValue({ id: "pay_r", order_id: "order_r", amount: 40000, status: "captured" })
    const verify = await request(app).post("/api/v1/payment/verifyPayment").set(auth(second))
      .send({ razorpay_order_id: "order_r", razorpay_payment_id: "pay_r", razorpay_signature: hmac("order_r|pay_r") })
    expect(verify.status).toBe(200)
    const coupon = await Coupon.findOne({ code: "ONCE" })
    expect(coupon.usedCount).toBe(1)
    expect(coupon.reservations.filter((r) => String(r.user) === String(second._id))).toHaveLength(0)
  })
})

describe("V9: enrollment needs a captured payment", () => {
  async function setup(payment) {
    const { course } = await courseWithLectures(await instructor(), 1)
    const buyer = await student()
    mockOrders.fetch.mockResolvedValue({ id: "order_v", amount: 50000, currency: "INR", notes: { userId: String(buyer._id), courses: String(course._id) } })
    mockPayments.fetch.mockResolvedValue({ id: "pay_v", order_id: "order_v", amount: 50000, ...payment })
    const res = await request(app).post("/api/v1/payment/verifyPayment").set(auth(buyer))
      .send({ razorpay_order_id: "order_v", razorpay_payment_id: "pay_v", razorpay_signature: hmac("order_v|pay_v") })
    return { res, course }
  }

  test("an authorized payment is captured first, then enrolls", async () => {
    mockPayments.capture.mockResolvedValue({ id: "pay_v", order_id: "order_v", amount: 50000, status: "captured" })
    const { res, course } = await setup({ status: "authorized" })
    expect(mockPayments.capture).toHaveBeenCalledWith("pay_v", 50000, "INR")
    expect(res.status).toBe(200)
    expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(1)
  })

  test("a failed payment, or one for another order or amount, doesn't enroll", async () => {
    for (const payment of [{ status: "failed" }, { status: "captured", order_id: "order_other" }, { status: "captured", amount: 100 }]) {
      const { res, course } = await setup(payment)
      expect(res.status).toBe(400)
      expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(0)
    }
  })
})

describe("M35: a stranger's failed logins don't lock the owner out", () => {
  const login = (email, password, ip) => request(app).post("/api/v1/auth/login").set("X-Forwarded-For", ip).send({ email, password })

  test("the attacker's IP runs out; the owner's doesn't", async () => {
    process.env.RATE_LIMIT_IN_TESTS = "1"
    const victim = await student()
    for (let i = 0; i < 8; i++) await login(victim.email, `wrong-${i}`, "203.0.113.7")
    expect((await login(victim.email, "wrong-9", "203.0.113.7")).status).toBe(429)
    // The account lockout (5 failures) is separate, so clear it to see the bucket alone.
    await User.updateOne({ _id: victim._id }, { $set: { failedLoginAttempts: 0, lockUntil: null } })
    expect((await login(victim.email, "Password123", "198.51.100.20")).status).toBe(200)
  })

  test("successful logins don't use up the bucket", async () => {
    process.env.RATE_LIMIT_IN_TESTS = "1"
    const user = await student()
    for (let i = 0; i < 12; i++) {
      const res = await login(user.email, "Password123", "198.51.100.21")
      expect(res.status).toBe(200)
      await new Promise((r) => setImmediate(r)) // let the refund run
    }
  })
})

describe("M13: money and its audit entry commit together", () => {
  test("a refund whose audit entry can't be written isn't marked done", async () => {
    const buyer = await student()
    await PaymentRecord.create({ orderId: "o_a", paymentId: "p_a", user: buyer._id, courses: [], amount: 500, source: "verify", status: "refund_pending" })
    mockPayments.refund.mockResolvedValue({ id: "rfnd" })
    const create = AuditLog.create.bind(AuditLog)
    jest.spyOn(AuditLog, "create").mockImplementation((docs, opts) => (opts?.session ? Promise.reject(new Error("audit store down")) : create(docs, opts)))

    await expect(handleRefund({ payload: { orderId: "o_a", paymentId: "p_a", amount: 500 } })).rejects.toThrow("audit store down")
    expect((await PaymentRecord.findOne({ orderId: "o_a" })).status).not.toBe("refunded")
  })

  test("a fulfilled order has its entry", async () => {
    const { course } = await courseWithLectures(await instructor(), 1, { price: 0 })
    const buyer = await student()
    await request(app).post("/api/v1/payment/capturePayment").set(auth(buyer)).send({ courses: [String(course._id)] })
    const entry = await AuditLog.findOne({ action: "order.fulfilled" })
    expect(String(entry.actor)).toBe(String(buyer._id))
  })
})

describe("M12: the audit log can't be changed through bulkWrite", () => {
  test("updates and deletes are refused; inserts work", async () => {
    const entry = await AuditLog.create({ action: "x.test" })
    await expect(AuditLog.bulkWrite([{ updateOne: { filter: { _id: entry._id }, update: { $set: { outcome: "failure" } } } }])).rejects.toThrow(/append-only/)
    await expect(AuditLog.bulkWrite([{ deleteOne: { filter: { _id: entry._id } } }])).rejects.toThrow(/append-only/)
    await AuditLog.bulkWrite([{ insertOne: { document: { action: "y.test" } } }])
    expect(await AuditLog.countDocuments()).toBe(2)
  })
})

describe("H14: missing indexes are created on an empty database", () => {
  test("empty collections get their indexes; collections with data are only reported", async () => {
    await User.collection.dropIndexes()
    await Coupon.collection.dropIndexes()
    await Coupon.collection.insertOne({ code: "HAS-DATA" })
    const { created, missing } = await ensureIndexes({ models: [User, Coupon] })
    expect(created).toEqual(["User"])
    expect(missing.map((m) => m.model)).toEqual(["Coupon"])
    expect((await User.collection.indexes()).map((i) => i.name)).toContain("email_1")
    await Coupon.collection.deleteMany({})
    await Coupon.createIndexes()
  })
})

describe("L9: model names", () => {
  test("models are PascalCase and keep their collections", () => {
    expect(mongoose.model("User").collection.collectionName).toBe("users")
    expect(mongoose.model("CourseProgress").collection.collectionName).toBe("courseprogresses")
  })
})

describe("M11: every route asks for a permission, not a role", () => {
  test("no route file uses a role check", () => {
    const fs = require("fs")
    const path = require("path")
    const dir = path.join(__dirname, "..", "routes")
    for (const file of fs.readdirSync(dir)) {
      expect(fs.readFileSync(path.join(dir, file), "utf8")).not.toMatch(/\bis(Instructor|Student|Admin)\b/)
    }
  })

  test("the table decides: students learn, instructors author, admins manage paths", async () => {
    const learner = await student()
    const teacher = await instructor()
    const admin = await createUser({ email: `a${++n}@example.com`, accountType: "Admin" })
    expect((await request(app).post("/api/v1/quiz/create").set(auth(learner)).send({})).status).toBe(403)
    expect((await request(app).post("/api/v1/quiz/submit").set(auth(teacher)).send({})).status).toBe(403)
    expect((await request(app).get("/api/v1/profile/instructorDashboard").set(auth(learner))).status).toBe(403)
    expect((await request(app).get("/api/v1/profile/instructorDashboard").set(auth(teacher))).status).toBe(200)
    expect((await request(app).post("/api/v1/learning-path/create").set(auth(teacher)).send({})).status).toBe(403)
    expect((await request(app).post("/api/v1/learning-path/create").set(auth(admin)).send({})).status).toBe(400)
  })
})

describe("L58: repeated searches are served from the cache", () => {
  test("the same search (in any key order) is a hit, and a catalog change clears it", async () => {
    const { invalidateCatalogCache } = require("../utils/cache")
    invalidateCatalogCache()
    await Course.create({ courseName: "Cache me", instructor: (await instructor())._id, status: "Published", thumbnail: "t", price: 10 })
    const search = (body) => request(app).post("/api/v1/course/searchCourses").send(body)
    const first = await search({ search: "cache", page: 1 })
    expect(first.headers["x-cache"]).toBe("MISS")
    const again = await search({ page: 1, search: "cache" })
    expect(again.headers["x-cache"]).toBe("HIT")
    expect(again.body.data).toHaveLength(1)
    invalidateCatalogCache()
    expect((await search({ search: "cache", page: 1 })).headers["x-cache"]).toBe("MISS")
  })
})
