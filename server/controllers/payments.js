const crypto = require("crypto")
const mongoose = require("mongoose")
const { getInstance } = require("../config/razorpay")
const Course = require("../models/Course")
const logger = require("../utils/logger")
const { findRedeemableCoupon, computeDiscount, reserveCouponUse, releaseCouponReservation } = require("../utils/coupon")
const { fulfillOrder, compensateFailedFulfillment, FulfillmentError } = require("../utils/orderFulfillment")
const PaymentRecord = require("../models/PaymentRecord")
const User = require("../models/User")
const { runInTransaction } = require("../utils/transaction")
const { recordAudit } = require("../utils/audit")

// Fulfils a paid order; if it cannot be delivered (FulfillmentError) the money is
// already taken, so queue a refund instead of leaving the customer charged for
// nothing. Anything else (a database blip) is rethrown so the caller can fail
// and let the provider retry.
async function fulfillOrRefund(args) {
  try {
    return await fulfillOrder(args)
  } catch (error) {
    if (!(error instanceof FulfillmentError)) throw error
    await compensateFailedFulfillment({ ...args, reason: error.message })
    return { refundQueued: true }
  }
}

// A refund made outside Learnify (Razorpay's dashboard): Learnify's own refunds
// carry the order id in their notes and are already recorded by the refund worker.
// A full refund takes the courses back; a partial one is recorded.
async function handleExternalRefund(payload) {
  const refund = payload?.refund?.entity
  if (!refund?.payment_id) return { ignored: true }
  if (refund.notes?.orderId) return { ignored: true, reason: "refund made by Learnify" }
  const record = await PaymentRecord.findOne({ paymentId: refund.payment_id })
  if (!record || record.externalRefundId === refund.id) return { ignored: true }
  const paid = Math.round((record.chargedAmount ?? record.amount) * 100)
  const full = Number(refund.amount) >= paid
  await runInTransaction(async (session) => {
    const opts = session ? { session } : {}
    await PaymentRecord.updateOne(
      { _id: record._id },
      { $set: { externalRefundId: refund.id, ...(full ? { status: "refunded", refundedAt: new Date() } : {}) } },
      opts
    )
    if (full && record.courses.length) {
      await Course.updateMany({ _id: { $in: record.courses } }, { $pull: { studentsEnroled: record.user } }, opts)
      await User.updateOne({ _id: record.user }, { $pullAll: { courses: record.courses } }, opts)
    }
    await recordAudit(null, {
      action: "payment.refunded_externally",
      targetType: "payment",
      targetId: record.orderId,
      metadata: { refundId: refund.id, amountPaise: refund.amount, full },
      session: session || undefined,
    })
  })
  return { recorded: true, enrollmentRemoved: full }
}

// A chargeback: recorded on the payment and in the audit log for an admin.
async function handleDispute(payload) {
  const dispute = payload?.dispute?.entity
  const paymentId = dispute?.payment_id || payload?.payment?.entity?.id
  if (!paymentId) return { ignored: true }
  const record = await runInTransaction(async (session) => {
    const found = await PaymentRecord.findOneAndUpdate({ paymentId }, { $set: { disputedAt: new Date() } }, session ? { session } : {})
    if (!found) return null
    await recordAudit(null, {
      action: "payment.disputed",
      outcome: "failure",
      targetType: "payment",
      targetId: found.orderId,
      metadata: { disputeId: dispute?.id, reason: dispute?.reason_code },
      session: session || undefined,
    })
    return found
  })
  if (!record) return { ignored: true }
  return { recorded: true }
}

// Razorpay caps each order-notes value at 256 chars; 10 ObjectIds (24 chars +
// comma) is the most that fits, and no sane cart is larger.
const MAX_CART_COURSES = 10

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

// Reads what *our server* wrote into the order at creation time. The client
// can never alter an order's notes, so — unlike anything in the request body —
// they are trustworthy for deciding who is enrolled in what.
function readOrderNotes(order) {
  const notes = order?.notes || {}
  const courseIds = (notes.courses || "").split(",").filter(Boolean)
  if (!notes.userId || courseIds.length === 0) return null
  return { userId: notes.userId, courseIds, couponCode: notes.couponCode || null }
}

// Creates a Razorpay order (or enrolls directly when the total is zero).
exports.capturePayment = async (req, res) => {
  const { courses, couponCode } = req.body
  const userId = req.user.id

  if (!Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ success: false, message: "Please Provide Course ID" })
  }
  if (!courses.every((id) => mongoose.isValidObjectId(id))) {
    return res.status(400).json({ success: false, message: "Invalid Course ID provided" })
  }
  const courseIds = [...new Set(courses.map(String))]
  if (courseIds.length > MAX_CART_COURSES) {
    return res.status(400).json({
      success: false,
      message: `You can check out at most ${MAX_CART_COURSES} courses at a time`,
    })
  }

  let subtotal = 0
  for (const courseId of courseIds) {
    const course = await Course.findById(courseId)
    // Only published, non-archived courses can be bought — previously any
    // course id (including an unreviewed draft) could be purchased directly.
    if (!course || course.status !== "Published" || course.deletedAt) {
      return res.status(404).json({ success: false, message: "Could not find the Course" })
    }
    if (course.studentsEnroled.some((id) => id.toString() === userId)) {
      return res.status(409).json({ success: false, message: "Student is already Enrolled" })
    }
    subtotal += course.price || 0
  }

  // Coupon is validated server-side, never trusted from the client.
  let discount = 0
  let appliedCouponCode = null
  if (couponCode) {
    const { coupon, error } = await findRedeemableCoupon(couponCode, userId)
    if (error) return res.status(400).json({ success: false, message: error })
    discount = computeDiscount(coupon, subtotal)
    appliedCouponCode = coupon.code
    // Hold one use while the student pays, so a limited coupon can't be spent
    // more times than allowed by shoppers checking out at the same moment.
    if (!(await reserveCouponUse(coupon.code, userId))) {
      return res.status(400).json({ success: false, message: "This coupon has reached its usage limit" })
    }
  }
  const finalAmount = subtotal - discount

  try {
    // A zero total (free course or 100%-off coupon) skips Razorpay entirely.
    if (finalAmount <= 0) {
      await fulfillOrder({
        // The same user and courses give the same id, so repeats can't create a
        // second record or count the coupon twice.
        orderId: `free_${userId}_${[...courseIds].sort().join("_")}`,
        userId,
        courseIds,
        couponCode: appliedCouponCode,
        amount: 0,
        source: "free",
      })
      return res.status(200).json({
        success: true,
        freeEnrollment: true,
        message: "Enrolled successfully",
      })
    }

    const order = await getInstance().orders.create({
      // Razorpay needs whole paise; 19.99 * 100 is 1998.9999999999998 in floating point.
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      receipt: `rcpt_${Date.now()}_${userId.slice(-6)}`,
      notes: {
        userId,
        courses: courseIds.join(","),
        subtotal: String(subtotal),
        discount: String(discount),
        ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
      },
    })
    return res.json({ success: true, data: order })
  } catch (error) {
    // No order, so nothing will use the held coupon.
    if (appliedCouponCode) await releaseCouponReservation(appliedCouponCode, userId).catch(() => {})
    if (error instanceof FulfillmentError) {
      return res.status(409).json({ success: false, message: "These courses are not available" })
    }
    logger.error({ err: error.message }, "could not create order")
    return res.status(500).json({ success: false, message: "Could not initiate order." })
  }
}

// Called by the browser right after Razorpay's checkout succeeds.
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courses } = req.body || {}
  const userId = req.user.id
  // A definite answer: this payment is not valid. The idempotency layer may store it.
  const fail = () => res.status(400).json({ success: false, message: "Payment Failed" })

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return fail()

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET || "")
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex")
  if (!safeEqual(expectedSignature, razorpay_signature)) return fail()

  try {
    // The signature only proves this order id was paid. What it was an order
    // *for*, and who it was for, comes from the notes we set ourselves.
    const order = await getInstance().orders.fetch(razorpay_order_id)
    const notes = readOrderNotes(order)
    if (!notes || notes.userId !== userId) return fail()

    // Sanity check: whatever the client claims it bought must match the order.
    if (Array.isArray(courses)) {
      const claimed = [...new Set(courses.map(String))].sort().join(",")
      if (claimed !== [...notes.courseIds].sort().join(",")) return fail()
    }

    // The signature proves Razorpay issued this payment id for this order, not that
    // the money was taken. On an account that captures manually, a payment can be
    // only "authorized", and Razorpay releases it after a few days if nobody
    // captures it. So enroll only on a captured payment, capturing it here if needed.
    let payment = await getInstance().payments.fetch(razorpay_payment_id)
    if (payment.order_id !== razorpay_order_id || Number(payment.amount) !== Number(order.amount)) return fail()
    if (payment.status === "authorized") {
      payment = await getInstance().payments.capture(razorpay_payment_id, order.amount, order.currency || "INR")
    }
    if (payment.status !== "captured") return fail()

    const outcome = await fulfillOrRefund({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      userId,
      courseIds: notes.courseIds,
      couponCode: notes.couponCode,
      amount: order.amount / 100,
      source: "verify",
    })
    if (outcome.refundQueued) {
      return res.status(200).json({
        success: false,
        refundQueued: true,
        message: "We could not complete your enrollment. Your payment will be refunded automatically.",
      })
    }
    return res.status(200).json({ success: true, message: "Payment Verified" })
  } catch (error) {
    // Temporary (Razorpay or the database): the payment may be perfectly good. A 5xx
    // isn't stored by the idempotency layer, so the client can retry.
    logger.error({ err: error.message }, "verifyPayment failed")
    return res.status(503).json({
      success: false,
      message: "We could not confirm your payment yet. If you were charged, you will be enrolled shortly.",
    })
  }
}

// Server-to-server notification from Razorpay. Without this, a student who
// pays and then closes the tab before the browser calls verifyPayment would
// be charged and never enrolled. Configure it in the Razorpay dashboard
// (event: payment.captured) with the secret in RAZORPAY_WEBHOOK_SECRET.
exports.razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    return res.status(503).json({ success: false, message: "Webhook not configured" })
  }

  const signature = req.headers["x-razorpay-signature"]
  if (!signature || !req.rawBody) {
    return res.status(400).json({ success: false, message: "Missing signature" })
  }
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex")
  if (!safeEqual(expected, signature)) {
    return res.status(400).json({ success: false, message: "Invalid signature" })
  }

  const event = req.body?.event
  if (event === "refund.processed" || event === "payment.dispute.created") {
    try {
      const outcome = event === "refund.processed" ? await handleExternalRefund(req.body.payload) : await handleDispute(req.body.payload)
      return res.status(200).json({ success: true, ...outcome })
    } catch (error) {
      logger.error({ err: error.message, event }, "razorpay webhook failed")
      return res.status(500).json({ success: false })
    }
  }
  if (event !== "payment.captured" && event !== "order.paid") {
    return res.status(200).json({ success: true, ignored: true })
  }

  try {
    const payment = req.body?.payload?.payment?.entity
    if (!payment?.order_id) return res.status(200).json({ success: true, ignored: true })

    const order = await getInstance().orders.fetch(payment.order_id)
    const notes = readOrderNotes(order)
    // An order we didn't create (or one predating this scheme): nothing to do.
    if (!notes) return res.status(200).json({ success: true, ignored: true })

    const { alreadyProcessed, refundQueued } = await fulfillOrRefund({
      orderId: payment.order_id,
      paymentId: payment.id,
      userId: notes.userId,
      courseIds: notes.courseIds,
      couponCode: notes.couponCode,
      amount: order.amount / 100,
      source: "webhook",
    })
    // A queued refund is a handled outcome: answer 200 so Razorpay stops retrying.
    return res.status(200).json({ success: true, alreadyProcessed, refundQueued })
  } catch (error) {
    // 5xx makes Razorpay retry the delivery later.
    logger.error({ err: error.message }, "razorpay webhook failed")
    return res.status(500).json({ success: false })
  }
}
