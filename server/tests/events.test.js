// Mail and Razorpay are third parties: replaced so we can assert on, and fail, them.
const mockSend = jest.fn().mockResolvedValue({ response: "mocked" })
jest.mock("../utils/mailSender", () => (...args) => mockSend(...args))
const mockRefund = jest.fn()
jest.mock("../config/razorpay", () => ({
  getInstance: () => ({ payments: { refund: (...args) => mockRefund(...args) } }),
}))

const request = require("supertest")
const app = require("../app")
const OutboxEvent = require("../models/OutboxEvent")
const ProcessedEvent = require("../models/ProcessedEvent")
const PaymentRecord = require("../models/PaymentRecord")
const Course = require("../models/Course")
const Section = require("../models/Section")
const Coupon = require("../models/Coupon")
const { enqueueEvent } = require("../events/outbox")
const { drain, backoffMs } = require("../events/relay")
const { EVENTS } = require("../events/types")
const { runInTransaction } = require("../utils/transaction")
const { fulfillOrder, compensateFailedFulfillment, FulfillmentError } = require("../utils/orderFulfillment")
const { withTimeout, retry } = require("../utils/resilience")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)
afterAll(async () => {
  await stopTestDb()
})
beforeEach(() => {
  mockSend.mockClear()
  mockSend.mockResolvedValue({ response: "mocked" })
  mockRefund.mockReset()
})
afterEach(async () => {
  await clearTestDb()
})

async function makeCourse(instructor, overrides = {}) {
  const section = await Section.create({ sectionName: "S", subSection: [] })
  return Course.create({
    courseName: "Course A",
    courseDescription: "d",
    instructor: instructor._id,
    whatYouWillLearn: "w",
    price: 100,
    tag: ["t"],
    thumbnail: "http://x/t.jpg",
    instructions: ["i"],
    status: "Published",
    courseContent: [section._id],
    ...overrides,
  })
}

describe("transactions", () => {
  test("all writes commit together, or none do", async () => {
    await expect(
      runInTransaction(async (session) => {
        await enqueueEvent("x.happened", { a: 1 }, { session })
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")
    expect(await OutboxEvent.countDocuments()).toBe(0)

    await runInTransaction(async (session) => {
      await enqueueEvent("x.happened", { a: 1 }, { session })
    })
    expect(await OutboxEvent.countDocuments()).toBe(1)
  })
})

describe("outbox relay + in-process consumers", () => {
  test("the OTP email is queued by the request and only sent by the relay/worker", async () => {
    const otpRes = await request(app).post("/api/v1/auth/sendotp").send({ email: "otp@example.com" })
    expect(otpRes.status).toBe(200)

    const pending = await OutboxEvent.find({ type: EVENTS.OTP_REQUESTED })
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe("pending")
    expect(mockSend).not.toHaveBeenCalled() // nothing is sent inside the request

    await drain()
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend.mock.calls[0][0]).toBe("otp@example.com")
    const delivered = await OutboxEvent.findOne({ type: EVENTS.OTP_REQUESTED })
    expect(delivered.status).toBe("sent")
    // The one-time code must not stay in the database once delivered.
    expect(delivered.payload).toEqual({ redacted: true })
  })

  test("signup writes the user and a user.registered event together; the welcome email follows", async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email: "ana@example.com" })
    const otp = (await require("../models/OTP").findOne({ email: "ana@example.com" })).otp
    await drain() // delivers the OTP email
    mockSend.mockClear()

    const res = await request(app).post("/api/v1/auth/signup").send({
      firstName: "Ana",
      lastName: "Lee",
      email: "ana@example.com",
      password: "Password123",
      confirmPassword: "Password123",
      accountType: "Student",
      otp,
    })
    expect(res.status).toBe(200)
    expect(await OutboxEvent.countDocuments({ type: EVENTS.USER_REGISTERED })).toBe(1)

    await drain()
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend.mock.calls[0][0]).toBe("ana@example.com")
    expect(mockSend.mock.calls[0][1]).toMatch(/welcome/i)
  })

  test("a failing consumer keeps the event pending with backoff, then succeeds on retry", async () => {
    await enqueueEvent(EVENTS.CONTACT_SUBMITTED, { email: "c@example.com", firstname: "C", lastname: "D", message: "hi" })
    mockSend.mockRejectedValueOnce(new Error("smtp down"))

    await drain()
    let row = await OutboxEvent.findOne({ type: EVENTS.CONTACT_SUBMITTED })
    expect(row.status).toBe("pending")
    expect(row.attempts).toBe(1)
    expect(row.lastError).toMatch(/smtp down/)
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())

    // Not due yet, so nothing is claimed...
    expect(await drain()).toBe(0)
    // ...until the backoff elapses.
    await OutboxEvent.updateOne({ _id: row._id }, { nextAttemptAt: new Date(Date.now() - 1) })
    expect(await drain()).toBe(1)
    row = await OutboxEvent.findOne({ type: EVENTS.CONTACT_SUBMITTED })
    expect(row.status).toBe("sent")
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  test("redelivery of an already-processed event does not repeat the side effect (idempotent consumer)", async () => {
    const event = await enqueueEvent(EVENTS.CONTACT_SUBMITTED, { email: "d@example.com", firstname: "D", lastname: "E", message: "m" })
    await drain()
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(await ProcessedEvent.countDocuments({ consumer: "email", eventId: event.eventId })).toBe(1)

    // Simulate the broker (or a relay crash) delivering it again.
    await OutboxEvent.updateOne({ _id: event._id }, { status: "pending", nextAttemptAt: new Date(0) })
    await drain()
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  test("a relay that died mid-publish is recovered: stale 'publishing' rows are reclaimed", async () => {
    const event = await enqueueEvent(EVENTS.CONTACT_SUBMITTED, { email: "e@example.com", firstname: "E", lastname: "F", message: "m" })
    await OutboxEvent.updateOne({ _id: event._id }, { status: "publishing", lockedAt: new Date(Date.now() - 60000) })
    expect(await drain()).toBe(1)
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  test("two relays draining at once never deliver the same row twice", async () => {
    for (let i = 0; i < 5; i++) {
      await enqueueEvent(EVENTS.CONTACT_SUBMITTED, { email: `p${i}@example.com`, firstname: "P", lastname: "Q", message: "m" })
    }
    const [a, b] = await Promise.all([drain(), drain()])
    expect(a + b).toBe(5)
    expect(mockSend).toHaveBeenCalledTimes(5)
  })

  test("backoff grows and is capped", () => {
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(20)).toBe(60000)
  })
})

describe("checkout saga", () => {
  async function setup() {
    const instructor = await createUser({ email: "i@example.com", accountType: "Instructor" })
    const student = await createUser({ email: "s@example.com", accountType: "Student" })
    const course = await makeCourse(instructor)
    return { student, course }
  }

  test("fulfilment enrols, records the payment and queues the confirmation email atomically", async () => {
    const { student, course } = await setup()
    await Coupon.create({ code: "SAVE10", discountType: "percent", discountValue: 10, usedCount: 0 }).catch(() => {})
    const out = await fulfillOrder({
      orderId: "order_1",
      paymentId: "pay_1",
      userId: student._id,
      courseIds: [String(course._id)],
      amount: 100,
      source: "verify",
    })
    expect(out.alreadyProcessed).toBe(false)
    expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(1)
    expect(await PaymentRecord.countDocuments({ orderId: "order_1" })).toBe(1)
    expect(await OutboxEvent.countDocuments({ type: EVENTS.ORDER_PAID })).toBe(1)

    await drain()
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend.mock.calls[0][0]).toBe("s@example.com")
  })

  test("a repeat of the same order changes nothing and queues no second email", async () => {
    const { student, course } = await setup()
    const args = { orderId: "order_2", paymentId: "pay_2", userId: student._id, courseIds: [String(course._id)], amount: 100, source: "verify" }
    await fulfillOrder(args)
    const again = await fulfillOrder({ ...args, source: "webhook" })
    expect(again.alreadyProcessed).toBe(true)
    expect(await PaymentRecord.countDocuments({ orderId: "order_2" })).toBe(1)
    expect(await OutboxEvent.countDocuments({ type: EVENTS.ORDER_PAID })).toBe(1)
  })

  test("a failure inside the transaction rolls back the enrolment too", async () => {
    const { student, course } = await setup()
    // Fail at the payment-record step, which runs AFTER the enrolment writes.
    const spy = jest.spyOn(PaymentRecord, "create").mockRejectedValueOnce(new Error("disk full"))
    await expect(
      fulfillOrder({ orderId: "order_3", paymentId: "pay_3", userId: student._id, courseIds: [String(course._id)], amount: 100, source: "verify" })
    ).rejects.toThrow("disk full")
    spy.mockRestore()
    // Nothing was half-done: not enrolled, no event queued.
    expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(0)
    expect(await OutboxEvent.countDocuments()).toBe(0)
  })

  test("if the purchased course vanished, fulfilment raises FulfillmentError", async () => {
    const { student, course } = await setup()
    await Course.updateOne({ _id: course._id }, { deletedAt: new Date() })
    await expect(
      fulfillOrder({ orderId: "order_4", paymentId: "pay_4", userId: student._id, courseIds: [String(course._id)], amount: 100, source: "verify" })
    ).rejects.toBeInstanceOf(FulfillmentError)
  })

  test("compensation: a refund is queued once, executed by the worker, and the record ends up refunded", async () => {
    const { student, course } = await setup()
    const args = { orderId: "order_5", paymentId: "pay_5", userId: student._id, courseIds: [String(course._id)], amount: 100, source: "verify", reason: "course removed" }
    expect((await compensateFailedFulfillment(args)).queued).toBe(true)
    expect((await compensateFailedFulfillment(args)).queued).toBe(false) // idempotent per order
    expect((await PaymentRecord.findOne({ orderId: "order_5" })).status).toBe("refund_pending")

    mockRefund.mockResolvedValue({ id: "rfnd_1" })
    await drain()
    expect(mockRefund).toHaveBeenCalledTimes(1)
    expect(mockRefund.mock.calls[0][0]).toBe("pay_5")
    expect(mockRefund.mock.calls[0][1].amount).toBe(10000) // paise
    const record = await PaymentRecord.findOne({ orderId: "order_5" })
    expect(record.status).toBe("refunded")
    expect(record.refundedAt).toBeTruthy()
  })

  test("a refund the provider rejects is retried later and flagged, not lost", async () => {
    const { student, course } = await setup()
    await compensateFailedFulfillment({ orderId: "order_6", paymentId: "pay_6", userId: student._id, courseIds: [String(course._id)], amount: 50, source: "webhook", reason: "x" })
    mockRefund.mockRejectedValueOnce(Object.assign(new Error("gateway error"), { error: { description: "temporary" } }))
    await drain()
    expect((await PaymentRecord.findOne({ orderId: "order_6" })).status).toBe("refund_failed")
    const row = await OutboxEvent.findOne({ type: EVENTS.PAYMENT_REFUND_REQUESTED })
    expect(row.status).toBe("pending")

    mockRefund.mockResolvedValue({ id: "rfnd_2" })
    await OutboxEvent.updateOne({ _id: row._id }, { nextAttemptAt: new Date(0) })
    await drain()
    expect((await PaymentRecord.findOne({ orderId: "order_6" })).status).toBe("refunded")
  })
})

describe("resilience helpers", () => {
  test("withTimeout rejects a slow call", async () => {
    await expect(withTimeout(new Promise(() => {}), 30, "slow")).rejects.toThrow(/timed out/)
  })

  test("retry re-runs a flaky call and gives up after the limit", async () => {
    let n = 0
    const flaky = async () => {
      n++
      if (n < 3) throw new Error("flaky")
      return "ok"
    }
    expect(await retry(flaky, { retries: 3, baseMs: 1 })).toBe("ok")
    let m = 0
    await expect(retry(async () => { m++; throw new Error("always") }, { retries: 2, baseMs: 1 })).rejects.toThrow("always")
    expect(m).toBe(3)
  })
})
