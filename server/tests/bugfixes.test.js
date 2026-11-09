// Regression tests for the bugs listed in the project's bug audit. Each test is
// named after its bug id, and each one failed before its fix.
process.env.ENCRYPTION_KEY = "ab".repeat(32)
process.env.RAZORPAY_SECRET = "test_razorpay_secret"
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret"

jest.mock("../utils/mailSender", () => jest.fn().mockResolvedValue({ response: "mocked" }))
jest.mock("../utils/imageUploader", () => ({
  uploadImageToCloudinary: jest.fn().mockResolvedValue({ secure_url: "https://example.com/image.png" }),
}))

const mockOrders = { create: jest.fn(), fetch: jest.fn() }
// verifyPayment also fetches the payment: by default it's captured, for the order
// the test just returned from orders.fetch.
const mockCapturedPayment = async (id) => {
  const order = await mockOrders.fetch.mock.results.at(-1)?.value
  return { id, order_id: order?.id, amount: order?.amount, status: "captured" }
}
const mockPayments = { refund: jest.fn(), fetchMultipleRefund: jest.fn(), fetch: jest.fn(mockCapturedPayment), capture: jest.fn() }
jest.mock("../config/razorpay", () => ({ getInstance: () => ({ orders: mockOrders, payments: mockPayments }) }))

const crypto = require("crypto")
const fs = require("fs")
const os = require("os")
const express = require("express")
const mongoose = require("mongoose")
const pino = require("pino")
const pinoHttp = require("pino-http")
const request = require("supertest")

const app = require("../app")
const Category = require("../models/Category")
const Coupon = require("../models/Coupon")
const Course = require("../models/Course")
const Notification = require("../models/Notification")
const OTP = require("../models/OTP")
const OutboxEvent = require("../models/OutboxEvent")
const PaymentRecord = require("../models/PaymentRecord")
const RatingAndReview = require("../models/RatingandReview")
const RefreshToken = require("../models/RefreshToken")
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const User = require("../models/User")
const totp = require("../utils/totp")
const { signTwoFactorChallenge } = require("../controllers/Auth")
const { fulfillOrder } = require("../utils/orderFulfillment")
const { runInTransaction } = require("../utils/transaction")
const { handleRefund } = require("../workers/handlers/refund")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)
afterAll(async () => {
  await stopTestDb()
})
afterEach(async () => {
  jest.restoreAllMocks()
  await clearTestDb()
  Object.values(mockOrders).forEach((m) => m.mockReset())
  Object.values(mockPayments).forEach((m) => m.mockReset())
  mockPayments.fetch.mockImplementation(mockCapturedPayment)
})

const bearer = (token) => ({ Authorization: `Bearer ${token}` })
const auth = (user) => bearer(tokenFor(user))
const hmac = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex")
let counter = 0
const student = (overrides = {}) => createUser({ email: `student${++counter}@example.com`, ...overrides })
const instructor = () => createUser({ email: `teacher${++counter}@example.com`, accountType: "Instructor" })
const course = (owner, overrides = {}) =>
  Course.create({
    courseName: `Course ${++counter}`,
    courseDescription: "desc",
    instructor: owner._id,
    whatYouWillLearn: "stuff",
    price: 500,
    tag: ["t"],
    thumbnail: "http://example.com/t.jpg",
    instructions: ["x"],
    status: "Published",
    ...overrides,
  })
const latestOtp = async (email) =>
  (await OutboxEvent.findOne({ type: "otp.requested", "payload.email": email }).sort({ createdAt: -1 })).payload.otp
const signupBody = (email, otp) => ({
  firstName: "New",
  lastName: "User",
  email,
  password: "Password123",
  confirmPassword: "Password123",
  accountType: "Student",
  otp,
})
const tempFiles = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("tmp-")).length
const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

function planOf(explain) {
  const names = []
  const walk = (s) => {
    if (!s) return
    names.push(s.stage)
    walk(s.inputStage)
    ;(s.inputStages || []).forEach(walk)
  }
  const plan = explain.queryPlanner.winningPlan
  walk(plan.queryPlan || plan)
  return names
}

describe("C1: a 2FA challenge is not an access token", () => {
  test("it is refused on protected routes", async () => {
    const user = await student()
    const challenge = signTwoFactorChallenge(user)
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(bearer(challenge))).status).toBe(401)
    expect((await request(app).post("/api/v1/auth/logout-all").set(bearer(challenge))).status).toBe(401)
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(auth(user))).status).toBe(200)
  })
})

describe("H1: uploads are only parsed where they are expected", () => {
  const attach = (req) => req.attach("file", Buffer.alloc(200 * 1024, 1), "big.bin")

  test("anonymous multipart requests leave no temp files", async () => {
    const before = tempFiles()
    await attach(request(app).post("/api/v1/nope"))
    await attach(request(app).post("/nowhere"))
    await attach(request(app).post("/api/v1/course/createCourse"))
    await settle()
    expect(tempFiles()).toBe(before)
  })

  test("a logged-in upload route removes its temp file afterwards", async () => {
    const before = tempFiles()
    const owner = await instructor()
    const res = await attach(request(app).post("/api/v1/course/createCourse").set(auth(owner)))
    expect(res.status).toBe(400)
    await settle()
    expect(tempFiles()).toBe(before)
  })
})

describe("H1: real uploads still work", () => {
  test("a logged-in user can upload, and the temp file is removed afterwards", async () => {
    const { uploadImageToCloudinary } = require("../utils/imageUploader")
    const before = tempFiles()
    const user = await student()
    const res = await request(app)
      .put("/api/v1/profile/updateDisplayPicture")
      .set(auth(user))
      .attach("displayPicture", Buffer.alloc(1024, 1), "me.png")
    expect(res.status).toBe(200)
    expect(uploadImageToCloudinary.mock.calls[0][0].tempFilePath).toBeTruthy()
    await settle()
    expect(tempFiles()).toBe(before)
  })
})

describe("H2: archived courses stay out of public discovery", () => {
  test("category page and recommendations hide them", async () => {
    const owner = await instructor()
    const buyer = await student()
    const category = await Category.create({ name: "Cat" })
    const other = await Category.create({ name: "Other" })
    const live = await course(owner, { category: category._id, tag: ["x"] })
    const owned = await course(owner, { category: category._id, tag: ["x"], studentsEnroled: [buyer._id] })
    const archived = await course(owner, { category: category._id, tag: ["x"], deletedAt: new Date(), courseName: "ArchivedCourse" })
    const otherArchived = await course(owner, { category: other._id, deletedAt: new Date(), courseName: "OtherArchived" })
    await Category.updateOne({ _id: category._id }, { courses: [live._id, owned._id, archived._id] })
    await Category.updateOne({ _id: other._id }, { courses: [otherArchived._id] })

    const page = await request(app).post("/api/v1/course/getCategoryPageDetails").send({ categoryId: String(category._id) })
    expect(page.status).toBe(200)
    expect(JSON.stringify(page.body)).not.toMatch(/ArchivedCourse|OtherArchived/)

    const recommended = await request(app).get("/api/v1/course/recommendations").set(auth(buyer))
    expect(recommended.status).toBe(200)
    expect(JSON.stringify(recommended.body)).not.toMatch(/ArchivedCourse|OtherArchived/)
  })
})

describe("H3: unpublished courses are not public", () => {
  test("only the owner, an admin or an enrolled student can read a draft", async () => {
    const owner = await instructor()
    const stranger = await instructor()
    const enrolled = await student()
    const admin = await createUser({ email: `admin${++counter}@example.com`, accountType: "Admin" })
    const draft = await course(owner, { status: "Draft", studentsEnroled: [enrolled._id] })
    const read = (headers = {}) => request(app).post("/api/v1/course/getCourseDetails").set(headers).send({ courseId: String(draft._id) })

    expect((await read()).status).toBe(400)
    expect((await read(auth(stranger))).status).toBe(400)
    expect((await read(auth(owner))).status).toBe(200)
    expect((await read(auth(admin))).status).toBe(200)
    expect((await read(auth(enrolled))).status).toBe(200)
  })

  test("published courses stay public", async () => {
    const published = await course(await instructor())
    const res = await request(app).post("/api/v1/course/getCourseDetails").send({ courseId: String(published._id) })
    expect(res.status).toBe(200)
  })
})

describe("H4: a failing async handler answers instead of hanging", () => {
  test("a database error becomes a generic 500", async () => {
    const user = await student()
    const token = tokenFor(user)
    jest.spyOn(RefreshToken, "find").mockImplementation(() => {
      throw new Error("database exploded")
    })
    const res = await request(app).get("/api/v1/auth/sessions").set(bearer(token)).timeout(3000)
    expect(res.status).toBe(500)
    expect(res.body.message).not.toMatch(/exploded/)
  })
})

describe("H5: request logs hide credentials", () => {
  test("Authorization and Cookie headers are redacted", async () => {
    const { redactPaths } = require("../utils/logger")
    const lines = []
    const logger = pino({ redact: redactPaths }, { write: (line) => lines.push(line) })
    const mini = express()
    mini.use(pinoHttp({ logger }))
    mini.get("/x", (req, res) => res.json({ ok: true }))
    await request(mini).get("/x").set("Authorization", "Bearer secret-token").set("Cookie", "refreshToken=secret-cookie")
    const output = lines.join("")
    expect(output).toContain('"url":"/x"')
    expect(output).not.toMatch(/secret-token|secret-cookie/)
  })
})

describe("H6 and M6: signup codes", () => {
  const email = "otp@example.com"
  const wrong = (otp) => (otp === "000000" ? "000001" : "000000")

  test("the code stops working after too many wrong guesses", async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email })
    const otp = await latestOtp(email)
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/v1/auth/signup").send(signupBody(email, wrong(otp)))
    }
    const res = await request(app).post("/api/v1/auth/signup").send(signupBody(email, otp))
    expect(res.status).toBe(400)
    expect(await User.countDocuments({ email })).toBe(0)
  })

  test("parallel guesses cannot exceed the limit", async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email })
    const otp = await latestOtp(email)
    const guesses = Array.from({ length: 20 }, () => request(app).post("/api/v1/auth/signup").send(signupBody(email, wrong(otp))))
    await Promise.all(guesses)
    const res = await request(app).post("/api/v1/auth/signup").send(signupBody(email, otp))
    expect(res.status).toBe(400)
  })

  test("the code is stored hashed and deleted after use", async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email })
    const otp = await latestOtp(email)
    expect((await OTP.findOne({ email })).otp).not.toBe(otp)
    const res = await request(app).post("/api/v1/auth/signup").send(signupBody(email, otp))
    expect(res.status).toBe(200)
    expect(await OTP.countDocuments({ email })).toBe(0)
  })
})

describe("H7 and M8: enabling 2FA", () => {
  test("needs the password, and signs out other sessions", async () => {
    const user = await student({ password: "Password123" })
    const login = () => request(app).post("/api/v1/auth/login").send({ email: user.email, password: "Password123" })
    const token = (await login()).body.token
    const other = await login()
    const cookie = other.headers["set-cookie"].find((c) => c.startsWith("refreshToken"))

    const setup = await request(app).post("/api/v1/auth/2fa/setup").set(bearer(token))
    const code = totp.codeForStep(setup.body.data.secret, totp.stepAt())
    const enable = (body) => request(app).post("/api/v1/auth/2fa/enable").set(bearer(token)).send(body)

    expect((await enable({ code })).status).toBe(400)
    expect((await enable({ code, password: "wrong-password" })).status).toBe(400)
    expect((await User.findById(user._id)).twoFactorEnabled).toBe(false)
    expect((await enable({ code, password: "Password123" })).status).toBe(200)

    const refreshed = await request(app).post("/api/v1/auth/refresh").set("X-Requested-With", "XMLHttpRequest").set("Cookie", cookie.split(";")[0])
    expect(refreshed.status).toBe(401)
  })
})

describe("H8 and H9: money is returned when courses cannot be delivered", () => {
  const refundEvents = () => OutboxEvent.find({ type: "payment.refund_requested" })

  test("H8: part of an order archived after checkout is refunded", async () => {
    const owner = await instructor()
    const buyer = await student()
    const keep = await course(owner, { price: 500 })
    const gone = await course(owner, { price: 2000, deletedAt: new Date() })
    const result = await fulfillOrder({ orderId: "order_p", paymentId: "pay_p", userId: buyer._id, courseIds: [keep._id, gone._id], amount: 2500, source: "verify" })

    expect(result.alreadyProcessed).toBe(false)
    expect(result.partialRefund).toBe(2000)
    const record = await PaymentRecord.findOne({ orderId: "order_p" })
    expect(record.status).toBe("fulfilled")
    expect(record.amount).toBe(500)
    expect(record.chargedAmount).toBe(2500)
    expect(record.courses.map(String)).toEqual([String(keep._id)])
    const [event] = await refundEvents()
    expect(event.payload).toMatchObject({ orderId: "order_p", paymentId: "pay_p", amount: 2000, partial: true })
  })

  test("H9: an order that delivers nothing new is fully refunded", async () => {
    const buyer = await student()
    const paid = await course(await instructor(), { price: 700 })
    await fulfillOrder({ orderId: "order_1", paymentId: "pay_1", userId: buyer._id, courseIds: [paid._id], amount: 700, source: "verify" })

    const second = fulfillOrder({ orderId: "order_2", paymentId: "pay_2", userId: buyer._id, courseIds: [paid._id], amount: 700, source: "verify" })
    await expect(second).rejects.toThrow(/already/)
  })

  test("H9: the payment routes queue that refund", async () => {
    const buyer = await student()
    const paid = await course(await instructor(), { price: 700 })
    await fulfillOrder({ orderId: "order_a", paymentId: "pay_a", userId: buyer._id, courseIds: [paid._id], amount: 700, source: "verify" })
    mockOrders.fetch.mockResolvedValue({ id: "order_b", amount: 70000, notes: { userId: String(buyer._id), courses: String(paid._id) } })

    const res = await request(app)
      .post("/api/v1/payment/verifyPayment")
      .set(auth(buyer))
      .send({ razorpay_order_id: "order_b", razorpay_payment_id: "pay_b", razorpay_signature: hmac("test_razorpay_secret", "order_b|pay_b") })

    expect(res.body.refundQueued).toBe(true)
    expect((await PaymentRecord.findOne({ orderId: "order_b" })).status).toBe("refund_pending")
    expect((await refundEvents())[0].payload.amount).toBe(700)
    expect((await PaymentRecord.find({ user: buyer._id, status: "fulfilled" })).length).toBe(1)
  })

  test("a repeated delivery of one order still changes nothing", async () => {
    const buyer = await student()
    const paid = await course(await instructor())
    const args = { orderId: "order_r", paymentId: "pay_r", userId: buyer._id, courseIds: [paid._id], amount: 500, source: "verify" }
    await fulfillOrder(args)
    expect((await fulfillOrder({ ...args, source: "webhook" })).alreadyProcessed).toBe(true)
    expect(await refundEvents()).toHaveLength(0)
  })

  test("a partial refund refunds its share once and leaves the order fulfilled", async () => {
    const buyer = await student()
    const keep = await course(await instructor(), { price: 500 })
    const gone = await course(await instructor(), { price: 500, deletedAt: new Date() })
    await fulfillOrder({ orderId: "order_h", paymentId: "pay_h", userId: buyer._id, courseIds: [keep._id, gone._id], amount: 1000, source: "verify" })
    const [event] = await refundEvents()
    mockPayments.fetchMultipleRefund.mockResolvedValue({ items: [] })
    mockPayments.refund.mockResolvedValue({ id: "rfnd_1" })

    await handleRefund({ payload: event.payload })
    expect(mockPayments.refund).toHaveBeenCalledWith("pay_h", expect.objectContaining({ amount: 50000 }))
    let record = await PaymentRecord.findOne({ orderId: "order_h" })
    expect(record.status).toBe("fulfilled")
    expect(record.partialRefund.status).toBe("refunded")

    await handleRefund({ payload: event.payload })
    expect(mockPayments.refund).toHaveBeenCalledTimes(1)

    // A retry after a lost response must find the refund Razorpay already made.
    await PaymentRecord.updateOne({ orderId: "order_h" }, { $set: { "partialRefund.status": "pending" } })
    mockPayments.fetchMultipleRefund.mockResolvedValue({ items: [{ id: "rfnd_1", notes: { orderId: "order_h" } }] })
    await handleRefund({ payload: event.payload })
    expect(mockPayments.refund).toHaveBeenCalledTimes(1)
    record = await PaymentRecord.findOne({ orderId: "order_h" })
    expect(record.partialRefund.status).toBe("refunded")
  })
})

describe("H10: temporary failures during verification", () => {
  test("are retryable, and invalid signatures are not", async () => {
    const buyer = await student()
    const paid = await course(await instructor())
    const body = { razorpay_order_id: "order_t", razorpay_payment_id: "pay_t", razorpay_signature: hmac("test_razorpay_secret", "order_t|pay_t"), courses: [String(paid._id)] }
    const verify = (payload) => request(app).post("/api/v1/payment/verifyPayment").set(auth(buyer)).set("Idempotency-Key", "verify-pay_t").send(payload)
    mockOrders.fetch.mockRejectedValueOnce(new Error("ETIMEDOUT"))

    const first = await verify(body)
    expect(first.status).toBe(503)
    expect(first.headers["idempotent-replayed"]).toBeUndefined()

    mockOrders.fetch.mockResolvedValue({ id: "order_t", amount: 50000, notes: { userId: String(buyer._id), courses: String(paid._id) } })
    const retry = await verify(body)
    expect(retry.status).toBe(200)
    expect(retry.body.success).toBe(true)
    expect((await Course.findById(paid._id)).studentsEnroled).toHaveLength(1)

    const forged = await request(app).post("/api/v1/payment/verifyPayment").set(auth(buyer)).send({ ...body, razorpay_signature: "bad" })
    expect(forged.status).toBe(400)
  })
})

describe("H11: section and lecture routes check ownership of what they change", () => {
  async function setup() {
    const victim = await instructor()
    const attacker = await instructor()
    const lecture = await SubSection.create({ title: "Original", description: "d", videoUrl: "http://example.com/v.mp4", timeDuration: "1" })
    const section = await Section.create({ sectionName: "Victim section", subSection: [lecture._id] })
    const victimCourse = await course(victim, { courseContent: [section._id] })
    const attackerSection = await Section.create({ sectionName: "Mine" })
    const attackerCourse = await course(attacker, { courseContent: [attackerSection._id] })
    return { attacker, lecture, section, victimCourse, attackerSection, attackerCourse }
  }
  const post = (path, user, body) => request(app).post(`/api/v1/course/${path}`).set(auth(user)).send(body)

  test("another instructor's section cannot be renamed or deleted", async () => {
    const { attacker, section, attackerCourse, lecture } = await setup()
    const ids = { sectionId: String(section._id), courseId: String(attackerCourse._id) }
    expect((await post("updateSection", attacker, { ...ids, sectionName: "Hacked" })).status).toBe(404)
    expect((await post("deleteSection", attacker, ids)).status).toBe(404)
    const after = await Section.findById(section._id)
    expect(after.sectionName).toBe("Victim section")
    expect(await SubSection.findById(lecture._id)).toBeTruthy()
  })

  test("another instructor's lecture cannot be edited or deleted", async () => {
    const { attacker, lecture, attackerSection } = await setup()
    const ids = { subSectionId: String(lecture._id), sectionId: String(attackerSection._id) }
    expect((await post("updateSubSection", attacker, { ...ids, title: "Hacked" })).status).toBe(404)
    expect((await post("deleteSubSection", attacker, ids)).status).toBe(404)
    expect((await SubSection.findById(lecture._id)).title).toBe("Original")
  })
})

describe("Medium fixes", () => {
  test("M1: login answers the same for unknown emails and wrong passwords", async () => {
    const user = await student()
    const unknown = await request(app).post("/api/v1/auth/login").send({ email: "nobody@example.com", password: "Password123" })
    const wrong = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: "wrong-password" })
    expect(unknown.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(unknown.body.message).toBe(wrong.body.message)
  })

  test("M2: operators cannot reach the category query", async () => {
    await Category.create({ name: "Cat" })
    const res = await request(app).post("/api/v1/course/getCategoryPageDetails").send({ categoryId: { $ne: null } })
    expect(res.status).toBe(400)
  })

  test("M3: 500 responses do not reveal internal errors", async () => {
    jest.spyOn(Course, "aggregate").mockImplementation(() => {
      throw new Error("secret internal detail")
    })
    const res = await request(app).get("/api/v1/course/getAllCourses?m3=1")
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toMatch(/secret internal/)
  })

  test("M4: students cannot trigger payment emails", async () => {
    const res = await request(app)
      .post("/api/v1/payment/sendPaymentSuccessEmail")
      .set(auth(await student()))
      .send({ orderId: "fake", paymentId: "fake", amount: 100 })
    expect(res.status).toBe(404)
  })

  test("M5: refresh token reuse also ends the access token", async () => {
    const user = await student({ password: "Password123" })
    const login = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: "Password123" })
    const cookie = login.headers["set-cookie"].find((c) => c.startsWith("refreshToken")).split(";")[0]
    await request(app).post("/api/v1/auth/refresh").set("X-Requested-With", "XMLHttpRequest").set("Cookie", cookie)
    await RefreshToken.updateMany({ user: user._id }, { $set: { usedAt: new Date(Date.now() - 60000) } })
    const replay = await request(app).post("/api/v1/auth/refresh").set("X-Requested-With", "XMLHttpRequest").set("Cookie", cookie)
    expect(replay.body.code).toBe("reuse")
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(bearer(login.body.token))).status).toBe(401)
  })

  test("M18: a failed section insert leaves no orphan", async () => {
    const owner = await instructor()
    const own = await course(owner)
    jest.spyOn(Course, "findByIdAndUpdate").mockImplementation(() => {
      throw new Error("boom")
    })
    const res = await request(app).post("/api/v1/course/addSection").set(auth(owner)).send({ sectionName: "S", courseId: String(own._id) })
    expect(res.status).toBe(500)
    expect(await Section.countDocuments({ sectionName: "S" })).toBe(0)
  })

  test("M19: a category with archived courses cannot be deleted", async () => {
    const admin = await createUser({ email: `admin${++counter}@example.com`, accountType: "Admin" })
    const category = await Category.create({ name: "Cat" })
    await course(await instructor(), { category: category._id, deletedAt: new Date() })
    const res = await request(app).post("/api/v1/course/deleteCategory").set(auth(admin)).send({ categoryId: String(category._id) })
    expect(res.status).toBe(400)
    expect(await Category.findById(category._id)).toBeTruthy()
  })

  test("M21: enrolled students keep lecture access after a course is archived", async () => {
    const { lectureAccess } = require("../utils/access")
    const buyer = await student()
    const lecture = await SubSection.create({ title: "L", description: "d", videoUrl: "http://example.com/v.mp4", timeDuration: "1" })
    const section = await Section.create({ sectionName: "S", subSection: [lecture._id] })
    await course(await instructor(), { courseContent: [section._id], studentsEnroled: [buyer._id], deletedAt: new Date() })
    expect(await lectureAccess({ id: String(buyer._id), accountType: "Student" }, String(lecture._id))).toBeTruthy()
    expect(await lectureAccess({ id: String(new mongoose.Types.ObjectId()), accountType: "Student" }, String(lecture._id))).toBeNull()
  })

  test("M22: malformed JSON keeps its CORS headers", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "http://localhost:3000")
      .set("Content-Type", "application/json")
      .send("{not json")
    expect(res.status).toBe(400)
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000")
  })

  test("M26: one student gets one review, even in parallel", async () => {
    const buyer = await student()
    const paid = await course(await instructor(), { studentsEnroled: [buyer._id] })
    const token = tokenFor(buyer)
    const posts = Array.from({ length: 6 }, () =>
      request(app).post("/api/v1/course/createRating").set(bearer(token)).send({ courseId: String(paid._id), rating: 5, review: "great" })
    )
    const statuses = (await Promise.all(posts)).map((r) => r.status)
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(await RatingAndReview.countDocuments({ user: buyer._id, course: paid._id })).toBe(1)
    expect((await Course.findById(paid._id)).ratingAndReviews).toHaveLength(1)
  })

  test("M27: catalog and feed use the index for their tie-broken sort", async () => {
    const owner = await instructor()
    await Course.insertMany(
      Array.from({ length: 200 }, (_, i) => ({
        courseName: `C${i}`, instructor: owner._id, status: "Published", deletedAt: null, thumbnail: "t", price: 1, createdAt: new Date(1000 + i),
      }))
    )
    await Notification.insertMany(Array.from({ length: 200 }, (_, i) => ({ user: owner._id, type: "x", title: "t", message: "m", createdAt: new Date(1000 + i) })))
    const catalog = await Course.collection.find({ status: "Published", deletedAt: null }).sort({ createdAt: -1, _id: -1 }).limit(25).explain("executionStats")
    expect(planOf(catalog)).not.toContain("SORT")
    expect(catalog.executionStats.totalDocsExamined).toBeLessThanOrEqual(26)
    const feed = await Notification.collection.find({ user: owner._id }).sort({ createdAt: -1, _id: -1 }).limit(31).explain("executionStats")
    expect(planOf(feed)).not.toContain("SORT")
  })

  test("M28 and U1: the category page is bounded and shows real best sellers", async () => {
    const owner = await instructor()
    const category = await Category.create({ name: "Big" })
    const popular = await course(owner, { category: category._id, studentsEnroled: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()], courseName: "Popular" })
    await Course.insertMany(
      Array.from({ length: 80 }, (_, i) => ({
        courseName: `C${i}`, instructor: owner._id, category: category._id, status: "Published", deletedAt: null, thumbnail: "t", price: 1,
      }))
    )
    const res = await request(app).post("/api/v1/course/getCategoryPageDetails").send({ categoryId: String(category._id) })
    expect(res.status).toBe(200)
    expect(res.body.data.selectedCategory.courses.length).toBeLessThanOrEqual(48)
    expect(res.body.data.selectedCategory.total).toBe(81)
    expect(String(res.body.data.mostSellingCourses[0]._id)).toBe(String(popular._id))
    expect(res.body.data.selectedCategory.courses[0]).toHaveProperty("avgRating")
  })

  test("M29 and M30: lecture access and audit filters use indexes", async () => {
    await Promise.all([Section.init(), Course.init(), require("../models/AuditLog").init()])
    const section = await Section.collection.find({ subSection: new mongoose.Types.ObjectId() }).limit(1).explain("executionStats")
    expect(planOf(section)).not.toContain("COLLSCAN")
    const owning = await Course.collection.find({ courseContent: new mongoose.Types.ObjectId() }).limit(1).explain("executionStats")
    expect(planOf(owning)).not.toContain("COLLSCAN")
    const indexes = await require("../models/AuditLog").collection.indexes()
    expect(indexes.some((i) => i.key.actorEmail === 1 && i.key._id === -1)).toBe(true)
  })

  test("M31: free orders cannot be duplicated", async () => {
    await Coupon.create({ code: "FREE100", discountType: "percentage", discountValue: 100, maxUses: 100, usedCount: 0 })
    const buyer = await student()
    const paid = await course(await instructor())
    const token = tokenFor(buyer)
    const posts = Array.from({ length: 5 }, () =>
      request(app).post("/api/v1/payment/capturePayment").set(bearer(token)).send({ courses: [String(paid._id)], couponCode: "FREE100" })
    )
    await Promise.all(posts)
    expect(await PaymentRecord.countDocuments({ user: buyer._id })).toBe(1)
    expect((await Coupon.findOne({ code: "FREE100" })).usedCount).toBe(1)
  })

  test("M32: decimal prices become whole paise", async () => {
    const buyer = await student()
    const paid = await course(await instructor(), { price: 19.99 })
    mockOrders.create.mockResolvedValue({ id: "order_d", amount: 1999, currency: "INR" })
    await request(app).post("/api/v1/payment/capturePayment").set(auth(buyer)).send({ courses: [String(paid._id)] })
    expect(mockOrders.create.mock.calls[0][0].amount).toBe(1999)
  })

  test("M33: production refuses to run without transactions", async () => {
    const standalone = { code: 20, message: "Transaction numbers are only allowed on a replica set member or mongos" }
    jest.spyOn(mongoose, "startSession").mockResolvedValue({ withTransaction: () => Promise.reject(standalone), endSession: async () => {} })
    const work = jest.fn().mockResolvedValue("done")
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      await expect(runInTransaction(work)).rejects.toBe(standalone)
    } finally {
      process.env.NODE_ENV = previous
    }
    expect(work).not.toHaveBeenCalled()
    await expect(runInTransaction(work)).resolves.toBe("done")
  })
})

describe("Low fixes", () => {
  test("L1: failed checkouts use real status codes", async () => {
    const res = await request(app).post("/api/v1/payment/capturePayment").set(auth(await student())).send({ courses: [] })
    expect(res.status).toBe(400)
  })

  test("L3: passwords bcrypt would truncate are refused", async () => {
    const email = "long@example.com"
    await request(app).post("/api/v1/auth/sendotp").send({ email })
    const long = "x".repeat(73)
    const res = await request(app).post("/api/v1/auth/signup").send({ ...signupBody(email, await latestOtp(email)), password: long, confirmPassword: long })
    expect(res.status).toBe(400)
  })

  test("L31: unknown query parameters do not bypass the cache", async () => {
    await request(app).get("/api/v1/course/getAllCourses?limit=7")
    const res = await request(app).get("/api/v1/course/getAllCourses?limit=7&junk=1")
    expect(res.headers["x-cache"]).toBe("HIT")
  })

  test("L38: an absurd page number is not a server error", async () => {
    const res = await request(app).post("/api/v1/course/searchCourses").send({ page: "99999999999999999999", limit: 12 })
    expect(res.status).toBe(200)
  })
})
