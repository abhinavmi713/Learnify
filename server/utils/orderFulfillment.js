const { ordersFulfilled } = require("./metrics")
const Course = require("../models/Course")
const User = require("../models/User")
const Coupon = require("../models/Coupon")
const CourseProgress = require("../models/CourseProgress")
const PaymentRecord = require("../models/PaymentRecord")
const logger = require("./logger")
const { runInTransaction } = require("./transaction")
const { enqueueEvent } = require("../events/outbox")
const { EVENTS } = require("../events/types")
const { recordAudit } = require("./audit")

// Raised when a paid order cannot be delivered (e.g. every course in it has been
// removed since checkout). The caller compensates by refunding the payment.
class FulfillmentError extends Error {
  constructor(message) {
    super(message)
    this.name = "FulfillmentError"
  }
}

// Enrolls a user in each course. Safe to run any number of times for the same
// (user, course): $addToSet + an upserted progress doc mean a repeat call
// changes nothing. Returns the courses the user was *newly* enrolled in.
// `session` makes every write part of the caller's transaction.
async function enrollUserInCourses(courseIds, userId, session = null) {
  const opts = session ? { session } : {}
  const newlyEnrolled = []
  for (const courseId of courseIds) {
    const course = await Course.findOne({ _id: courseId, deletedAt: null }, null, opts)
    if (!course) continue

    const result = await Course.updateOne(
      { _id: courseId, studentsEnroled: { $ne: userId } },
      { $addToSet: { studentsEnroled: userId } },
      opts
    )

    const progress = await CourseProgress.findOneAndUpdate(
      { courseID: courseId, userId },
      { $setOnInsert: { courseID: courseId, userId, completedVideos: [] } },
      { upsert: true, new: true, ...opts }
    )

    await User.updateOne({ _id: userId }, { $addToSet: { courses: courseId, courseProgress: progress._id } }, opts)

    if (result.modifiedCount === 1) newlyEnrolled.push(course)
  }
  return newlyEnrolled
}

const roundMoney = (value) => Math.round(value * 100) / 100

// The part of what was paid that belongs to undelivered courses, in proportion to
// list prices (a coupon reduced every course in the order equally).
async function undeliveredShare(amount, courseIds, undelivered, opts) {
  if (!amount) return 0
  const courses = await Course.find({ _id: { $in: courseIds } }, "price", opts).lean()
  const prices = new Map(courses.map((c) => [String(c._id), c.price || 0]))
  const sum = (ids) => ids.reduce((total, id) => total + (prices.get(String(id)) || 0), 0)
  const listTotal = sum(courseIds)
  const fraction = listTotal > 0 ? sum(undelivered) / listTotal : undelivered.length / courseIds.length
  return Math.min(amount, roundMoney(amount * fraction))
}

const isDuplicateOrder = (error) =>
  error?.code === 11000 && (error.keyPattern?.orderId || /orderId/.test(error.message || ""))

// Delivers a paid (or free) order exactly once per orderId.
//
// Enrollment, the payment record, the coupon count and the "order.paid" outbox
// event are written in ONE transaction: either the student is enrolled AND the
// payment is recorded AND the confirmation email is queued, or none of it
// happened. (Previously a crash between those steps could leave a student
// enrolled with no record, or a coupon uncounted.) The email itself is sent later
// by a worker from the outbox event, never inside this request.
//
// Returns { alreadyProcessed } so callers can tell a repeat (browser callback
// followed by the Razorpay webhook) apart. Throws FulfillmentError if the order
// delivers nothing new, so the caller refunds it. If it delivers only some of its
// courses, the rest of the money is refunded here (partialRefund in the result).
async function fulfillOrder({ orderId, paymentId, userId, courseIds, couponCode, amount, source }) {
  try {
    const result = await runInTransaction(async (session) => {
      const opts = session ? { session } : {}
      // Checked first: repeats of a delivered order must not look undeliverable.
      if (await PaymentRecord.findOne({ orderId }, "_id", opts)) return { alreadyProcessed: true }

      const newlyEnrolled = await enrollUserInCourses(courseIds, userId, session)
      if (newlyEnrolled.length === 0) {
        throw new FulfillmentError("the student already has these courses, or they are no longer available")
      }

      const delivered = new Set(newlyEnrolled.map((c) => String(c._id)))
      const undelivered = courseIds.map(String).filter((id) => !delivered.has(id))
      const partialRefund = undelivered.length ? await undeliveredShare(amount, courseIds, undelivered, opts) : 0

      await PaymentRecord.create(
        [
          {
            orderId,
            paymentId: paymentId || null,
            user: userId,
            courses: [...delivered],
            amount: roundMoney(amount - partialRefund),
            chargedAmount: amount,
            undeliveredCourses: undelivered,
            partialRefund: { amount: partialRefund, status: partialRefund > 0 ? "pending" : "none" },
            couponCode: couponCode || null,
            source,
          },
        ],
        opts
      )

      // The checkout's reservation becomes a use, in the same transaction.
      if (couponCode) {
        await Coupon.updateOne({ code: couponCode }, { $inc: { usedCount: 1 }, $pull: { reservations: { user: userId } } }, opts)
      }

      if (newlyEnrolled.length > 0) {
        await enqueueEvent(
          EVENTS.ORDER_PAID,
          { orderId, userId: String(userId), courseIds: newlyEnrolled.map((c) => String(c._id)) },
          { session }
        )
      }
      if (partialRefund > 0) {
        await enqueueEvent(
          EVENTS.PAYMENT_REFUND_REQUESTED,
          {
            orderId,
            paymentId,
            userId: String(userId),
            amount: partialRefund,
            partial: true,
            reason: "some courses in this order could not be delivered",
          },
          { session }
        )
      }
      // Recorded in the same transaction: an order is never delivered without its entry.
      await recordAudit(null, {
        action: "order.fulfilled",
        actor: { _id: userId },
        targetType: "payment",
        targetId: orderId,
        metadata: { amount, source, courses: newlyEnrolled.map((c) => String(c._id)), couponCode: couponCode || null },
        session: session || undefined,
      })
      return { alreadyProcessed: false, partialRefund }
    })
    // Counted after commit: the callback above can run again on a transient retry.
    if (!result.alreadyProcessed) ordersFulfilled.inc({ source: source || "unknown" })
    return result
  } catch (error) {
    // The unique orderId rejected the insert: this order was already delivered,
    // and the aborted transaction left everything as the first run set it.
    if (isDuplicateOrder(error)) return { alreadyProcessed: true }
    throw error
  }
}

// Compensating action for a payment we took but could not honour: record it and
// queue a refund (processed by the refund worker with retries). Idempotent per
// orderId. This is the "undo" step of the checkout saga; the money cannot be
// rolled back with a database transaction because it lives at the payment
// provider.
async function compensateFailedFulfillment({ orderId, paymentId, userId, courseIds, amount, couponCode, source, reason }) {
  try {
    await runInTransaction(async (session) => {
      const opts = session ? { session } : {}
      await PaymentRecord.create(
        [
          {
            orderId,
            paymentId: paymentId || null,
            user: userId,
            courses: courseIds,
            amount,
            couponCode: couponCode || null,
            source,
            status: "refund_pending",
            failureReason: String(reason || "fulfillment failed").slice(0, 300),
          },
        ],
        opts
      )
      await enqueueEvent(
        EVENTS.PAYMENT_REFUND_REQUESTED,
        { orderId, paymentId, userId: String(userId), amount, reason },
        { session }
      )
      await recordAudit(null, {
        action: "order.refund_queued",
        outcome: "failure",
        actor: { _id: userId },
        targetType: "payment",
        targetId: orderId,
        metadata: { amount, reason: String(reason || "").slice(0, 300) },
        session: session || undefined,
      })
    })
    logger.warn({ orderId, paymentId, reason }, "fulfillment failed; refund queued")
    return { queued: true }
  } catch (error) {
    if (isDuplicateOrder(error)) return { queued: false, alreadyHandled: true }
    throw error
  }
}

module.exports = { enrollUserInCourses, fulfillOrder, compensateFailedFulfillment, FulfillmentError }
