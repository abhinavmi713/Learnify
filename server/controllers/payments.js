const crypto = require("crypto")
const mongoose = require("mongoose")
const { getInstance } = require("../config/razorpay")
const Course = require("../models/Course")
const User = require("../models/User")
const mailSender = require("../utils/mailSender")
const logger = require("../utils/logger")
const { paymentSuccessEmail } = require("../mail/templates/paymentSuccessEmail")
const { findRedeemableCoupon, computeDiscount } = require("../utils/coupon")
const { fulfillOrder, compensateFailedFulfillment, FulfillmentError } = require("../utils/orderFulfillment")

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
    return res.json({ success: false, message: "Please Provide Course ID" })
  }
  if (!courses.every((id) => mongoose.isValidObjectId(id))) {
    return res.json({ success: false, message: "Invalid Course ID provided" })
  }
  const courseIds = [...new Set(courses.map(String))]
  if (courseIds.length > MAX_CART_COURSES) {
    return res.json({
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
      return res.status(200).json({ success: false, message: "Could not find the Course" })
    }
    if (course.studentsEnroled.some((id) => id.toString() === userId)) {
      return res.status(200).json({ success: false, message: "Student is already Enrolled" })
    }
    subtotal += course.price || 0
  }

  // Coupon is validated server-side, never trusted from the client.
  let discount = 0
  let appliedCouponCode = null
  if (couponCode) {
    const { coupon, error } = await findRedeemableCoupon(couponCode)
    if (error) return res.status(200).json({ success: false, message: error })
    discount = computeDiscount(coupon, subtotal)
    appliedCouponCode = coupon.code
  }
  const finalAmount = subtotal - discount

  try {
    // A zero total (free course or 100%-off coupon) skips Razorpay entirely.
    if (finalAmount <= 0) {
      await fulfillOrder({
        orderId: `free_${crypto.randomUUID()}`,
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
      amount: finalAmount * 100,
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
    logger.error({ err: error.message }, "could not create order")
    return res.status(500).json({ success: false, message: "Could not initiate order." })
  }
}

// Called by the browser right after Razorpay's checkout succeeds.
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courses } = req.body || {}
  const userId = req.user.id
  const fail = () => res.status(200).json({ success: false, message: "Payment Failed" })

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
    logger.error({ err: error.message }, "verifyPayment failed")
    return fail()
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

// Receipt email after payment.
exports.sendPaymentSuccessEmail = async (req, res) => {
  const { orderId, paymentId, amount } = req.body
  const userId = req.user.id

  if (!orderId || !paymentId || !amount || !userId) {
    return res.status(400).json({ success: false, message: "Please provide all the details" })
  }

  try {
    const student = await User.findById(userId)
    await mailSender(
      student.email,
      `Payment Received`,
      paymentSuccessEmail(`${student.firstName} ${student.lastName}`, amount / 100, orderId, paymentId)
    )
    return res.status(200).json({ success: true, message: "Payment email sent" })
  } catch (error) {
    return res.status(400).json({ success: false, message: "Could not send email" })
  }
}
