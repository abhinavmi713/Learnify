// Payments are the one flow where a bug costs real money or silently
// enrolls the wrong person, so these tests lean on the properties that
// matter: who/what an order is *for* comes from the server-set order notes,
// the client can't forge it, and the browser callback and Razorpay's webhook
// can both report the same payment without double-counting anything.
process.env.RAZORPAY_SECRET = "test_razorpay_secret"
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret"

jest.mock("../utils/mailSender", () => jest.fn().mockResolvedValue({ response: "mocked" }))

const mockOrders = { create: jest.fn(), fetch: jest.fn() }
jest.mock("../config/razorpay", () => ({ getInstance: () => ({ orders: mockOrders }) }))

const crypto = require("crypto")
const request = require("supertest")
const app = require("../app")
const Course = require("../models/Course")
const Coupon = require("../models/Coupon")
const User = require("../models/User")
const CourseProgress = require("../models/CourseProgress")
const PaymentRecord = require("../models/PaymentRecord")
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
  jest.clearAllMocks()
})

const hmac = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex")

async function makeCourse(instructor, overrides = {}) {
  return Course.create({
    courseName: "Paid Course",
    courseDescription: "desc",
    instructor: instructor._id,
    whatYouWillLearn: "stuff",
    price: 500,
    tag: ["t"],
    thumbnail: "http://example.com/t.jpg",
    instructions: ["x"],
    status: "Published",
    ...overrides,
  })
}

async function setup() {
  const instructor = await createUser({ email: "instr@example.com", accountType: "Instructor" })
  const student = await createUser({ email: "stud@example.com", accountType: "Student" })
  const course = await makeCourse(instructor)
  return { instructor, student, course }
}

// What Razorpay would return for an order our server created.
const orderFor = ({ student, courses, couponCode, amount = 50000, id = "order_1" }) => ({
  id,
  amount,
  notes: {
    userId: student._id.toString(),
    courses: courses.map((c) => c._id.toString()).join(","),
    ...(couponCode ? { couponCode } : {}),
  },
})

const verifyBody = (orderId, paymentId, courses) => ({
  razorpay_order_id: orderId,
  razorpay_payment_id: paymentId,
  razorpay_signature: hmac(process.env.RAZORPAY_SECRET, `${orderId}|${paymentId}`),
  courses: courses.map((c) => c._id.toString()),
})

describe("capturePayment", () => {
  test("creates a Razorpay order whose notes record who is buying what", async () => {
    const { student, course } = await setup()
    mockOrders.create.mockResolvedValue({ id: "order_1", amount: 50000 })

    const res = await request(app)
      .post("/api/v1/payment/capturePayment")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send({ courses: [course._id.toString()] })

    expect(res.body.success).toBe(true)
    const args = mockOrders.create.mock.calls[0][0]
    expect(args.amount).toBe(50000)
    expect(args.notes.userId).toBe(student._id.toString())
    expect(args.notes.courses).toBe(course._id.toString())
  })

  test("refuses to sell a course that isn't published", async () => {
    const { instructor, student } = await setup()
    const draft = await makeCourse(instructor, { status: "Draft" })

    const res = await request(app)
      .post("/api/v1/payment/capturePayment")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send({ courses: [draft._id.toString()] })

    expect(res.body.success).toBe(false)
    expect(mockOrders.create).not.toHaveBeenCalled()
  })

  test("a 100%-off coupon enrolls directly without ever calling Razorpay", async () => {
    const { student, course } = await setup()
    await Coupon.create({
      code: "FREE100",
      discountType: "percentage",
      discountValue: 100,
      createdBy: student._id,
    })

    const res = await request(app)
      .post("/api/v1/payment/capturePayment")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send({ courses: [course._id.toString()], couponCode: "FREE100" })

    expect(res.body.freeEnrollment).toBe(true)
    expect(mockOrders.create).not.toHaveBeenCalled()
    expect((await Course.findById(course._id)).studentsEnroled.map(String)).toContain(student._id.toString())
    expect((await Coupon.findOne({ code: "FREE100" })).usedCount).toBe(1)
  })
})

describe("verifyPayment", () => {
  test("rejects a forged signature", async () => {
    const { student, course } = await setup()
    mockOrders.fetch.mockResolvedValue(orderFor({ student, courses: [course] }))

    const body = verifyBody("order_1", "pay_1", [course])
    body.razorpay_signature = "0".repeat(64)
    const res = await request(app)
      .post("/api/v1/payment/verifyPayment")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send(body)

    expect(res.body.success).toBe(false)
    expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(0)
  })

  test("an order created for one user can't be redeemed by another", async () => {
    const { student, course } = await setup()
    const thief = await createUser({ email: "thief@example.com", accountType: "Student" })
    mockOrders.fetch.mockResolvedValue(orderFor({ student, courses: [course] }))

    const res = await request(app)
      .post("/api/v1/payment/verifyPayment")
      .set("Authorization", `Bearer ${tokenFor(thief)}`)
      .send(verifyBody("order_1", "pay_1", [course]))

    expect(res.body.success).toBe(false)
    expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(0)
  })

  test("a client can't swap in a different (pricier) course than the order was for", async () => {
    const { instructor, student, course } = await setup()
    const expensive = await makeCourse(instructor, { courseName: "Expensive", price: 99999 })
    mockOrders.fetch.mockResolvedValue(orderFor({ student, courses: [course] }))

    const res = await request(app)
      .post("/api/v1/payment/verifyPayment")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send(verifyBody("order_1", "pay_1", [expensive]))

    expect(res.body.success).toBe(false)
    expect((await Course.findById(expensive._id)).studentsEnroled).toHaveLength(0)
  })

  test("a valid payment enrolls the student and records the purchase", async () => {
    const { student, course } = await setup()
    mockOrders.fetch.mockResolvedValue(orderFor({ student, courses: [course] }))

    const res = await request(app)
      .post("/api/v1/payment/verifyPayment")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send(verifyBody("order_1", "pay_1", [course]))

    expect(res.body.success).toBe(true)
    expect((await Course.findById(course._id)).studentsEnroled.map(String)).toContain(student._id.toString())
    expect(await CourseProgress.countDocuments({ userId: student._id, courseID: course._id })).toBe(1)
    expect((await User.findById(student._id)).courses.map(String)).toContain(course._id.toString())
    const record = await PaymentRecord.findOne({ orderId: "order_1" })
    expect(record.amount).toBe(500)
    expect(record.source).toBe("verify")
  })

  test("retrying the same verification is harmless (no double enrollment, coupon counted once)", async () => {
    const { student, course } = await setup()
    await Coupon.create({ code: "SAVE10", discountType: "percentage", discountValue: 10, createdBy: student._id })
    mockOrders.fetch.mockResolvedValue(orderFor({ student, courses: [course], couponCode: "SAVE10", amount: 45000 }))

    const send = () =>
      request(app)
        .post("/api/v1/payment/verifyPayment")
        .set("Authorization", `Bearer ${tokenFor(student)}`)
        .send(verifyBody("order_1", "pay_1", [course]))
    expect((await send()).body.success).toBe(true)
    expect((await send()).body.success).toBe(true)

    expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(1)
    expect(await CourseProgress.countDocuments({ userId: student._id })).toBe(1)
    expect(await PaymentRecord.countDocuments({ orderId: "order_1" })).toBe(1)
    expect((await Coupon.findOne({ code: "SAVE10" })).usedCount).toBe(1)
  })
})

describe("razorpay webhook", () => {
  const send = (payload, { secret = process.env.RAZORPAY_WEBHOOK_SECRET, signature } = {}) => {
    const body = JSON.stringify(payload)
    return request(app)
      .post("/api/v1/payment/webhook")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", signature ?? hmac(secret, body))
      .send(body)
  }
  const captured = (orderId = "order_1") => ({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: orderId } } },
  })

  test("rejects a request with a bad signature", async () => {
    const res = await send(captured(), { signature: "deadbeef" })
    expect(res.status).toBe(400)
  })

  test("enrolls a student who paid but never came back to the site", async () => {
    const { student, course } = await setup()
    mockOrders.fetch.mockResolvedValue(orderFor({ student, courses: [course] }))

    const res = await send(captured())

    expect(res.status).toBe(200)
    expect((await Course.findById(course._id)).studentsEnroled.map(String)).toContain(student._id.toString())
    expect((await PaymentRecord.findOne({ orderId: "order_1" })).source).toBe("webhook")
  })

  test("a webhook arriving after the browser callback doesn't double-count", async () => {
    const { student, course } = await setup()
    await Coupon.create({ code: "SAVE10", discountType: "percentage", discountValue: 10, createdBy: student._id })
    mockOrders.fetch.mockResolvedValue(orderFor({ student, courses: [course], couponCode: "SAVE10", amount: 45000 }))

    await request(app)
      .post("/api/v1/payment/verifyPayment")
      .set("Authorization", `Bearer ${tokenFor(student)}`)
      .send(verifyBody("order_1", "pay_1", [course]))
    const res = await send(captured())

    expect(res.body.alreadyProcessed).toBe(true)
    expect(await PaymentRecord.countDocuments()).toBe(1)
    expect((await Coupon.findOne({ code: "SAVE10" })).usedCount).toBe(1)
    expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(1)
  })

  test("ignores events it doesn't care about", async () => {
    const res = await send({ event: "payment.failed", payload: {} })
    expect(res.status).toBe(200)
    expect(res.body.ignored).toBe(true)
    expect(mockOrders.fetch).not.toHaveBeenCalled()
  })
})
