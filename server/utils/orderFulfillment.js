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
// followed by the Razorpay webhook) apart. Throws FulfillmentError if nothing in
// the order can be delivered.
async function fulfillOrder({ orderId, paymentId, userId, courseIds, couponCode, amount, source }) {
  try {
    const result = await runInTransaction(async (session) => {
      const opts = session ? { session } : {}
      const newlyEnrolled = await enrollUserInCourses(courseIds, userId, session)

      const alreadyEnrolled = await Course.countDocuments(
        { _id: { $in: courseIds }, deletedAt: null, studentsEnroled: userId },
        opts
      )
      if (newlyEnrolled.length === 0 && alreadyEnrolled === 0) {
        throw new FulfillmentError("none of the purchased courses are available any more")
      }

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
          },
        ],
        opts
      )

      if (couponCode) await Coupon.updateOne({ code: couponCode }, { $inc: { usedCount: 1 } }, opts)

      if (newlyEnrolled.length > 0) {
        await enqueueEvent(
          EVENTS.ORDER_PAID,
          { orderId, userId: String(userId), courseIds: newlyEnrolled.map((c) => String(c._id)) },
          { session }
        )
      }
      return { alreadyProcessed: false }
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
    })
    logger.warn({ orderId, paymentId, reason }, "fulfillment failed; refund queued")
    return { queued: true }
  } catch (error) {
    if (isDuplicateOrder(error)) return { queued: false, alreadyHandled: true }
    throw error
  }
}

module.exports = { enrollUserInCourses, fulfillOrder, compensateFailedFulfillment, FulfillmentError }
