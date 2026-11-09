const PaymentRecord = require("../../models/PaymentRecord")
const User = require("../../models/User")
const mailSender = require("../../utils/mailSender")
const logger = require("../../utils/logger")
const { getInstance } = require("../../config/razorpay")
const { withBreaker, withTimeout } = require("../../utils/resilience")
const { notifyUser } = require("../../utils/notify")
const { refundEmail } = require("../../mail/templates/simpleEmails")

// Razorpay can take a while or be down; a breaker stops hammering it.
const callRefund = withBreaker(
  "razorpay-refund",
  (paymentId, amountPaise, notes) =>
    withTimeout(getInstance().payments.refund(paymentId, { amount: amountPaise, speed: "normal", notes }), 12000, "razorpay refund"),
  { timeout: 15000, volumeThreshold: 10 }
)

// "Already refunded" is a success for our purposes: the goal state is reached.
const alreadyRefunded = (error) =>
  /already (been )?(fully )?refunded|fully refunded/i.test(error?.error?.description || error?.message || "")

// A partial refund leaves the order fulfilled, and Razorpay would accept a second
// one, so a retry after a lost response must first look for the refund it made.
async function partialRefundExists(paymentId, orderId) {
  const response = await withTimeout(getInstance().payments.fetchMultipleRefund(paymentId, { count: 100 }), 12000, "razorpay refund list")
  return (response?.items || []).some((refund) => refund.notes?.orderId === orderId)
}

async function handlePartialRefund({ orderId, paymentId, amount, reason }) {
  const record = await PaymentRecord.findOne({ orderId })
  if (record?.partialRefund?.status === "refunded") return

  try {
    if (!(await partialRefundExists(paymentId, orderId))) {
      await callRefund(paymentId, Math.round(amount * 100), { orderId, reason: String(reason || "").slice(0, 200) })
    }
  } catch (error) {
    await PaymentRecord.updateOne({ orderId }, { $set: { "partialRefund.status": "failed" } })
    throw error // the queue retries; after the last attempt it lands in the DLQ for a human
  }

  await PaymentRecord.updateOne(
    { orderId },
    { $set: { "partialRefund.status": "refunded", "partialRefund.refundedAt": new Date() } }
  )
  logger.info({ orderId, paymentId, amount }, "partial refund made")

  const user = record && (await User.findById(record.user))
  if (user) {
    await notifyUser(user._id, `Part of your order could not be delivered, so Rs. ${amount} is being refunded.`, "/dashboard/enrolled-courses")
    await mailSender(user.email, "Part of your payment is being refunded", refundEmail(`${user.firstName} ${user.lastName}`, amount)).catch((error) =>
      logger.warn({ err: error.message }, "refund email not sent")
    )
  }
}

// Compensating action of the checkout saga. Payment was captured but we could
// not deliver the purchase, so give the money back. Safe to run repeatedly: it
// first checks the record, and Razorpay refuses a second full refund.
async function handleRefund(event) {
  if (event.payload.partial) return handlePartialRefund(event.payload)

  const { orderId, paymentId, amount, reason } = event.payload
  const record = await PaymentRecord.findOne({ orderId })
  if (record?.status === "refunded") return

  try {
    await callRefund(paymentId, Math.round(amount * 100), { orderId, reason: String(reason || "").slice(0, 200) })
  } catch (error) {
    if (!alreadyRefunded(error)) {
      await PaymentRecord.updateOne({ orderId }, { $set: { status: "refund_failed" } })
      throw error // the queue retries; after the last attempt it lands in the DLQ for a human
    }
  }

  await PaymentRecord.updateOne({ orderId }, { $set: { status: "refunded", refundedAt: new Date() } })
  logger.info({ orderId, paymentId }, "payment refunded")

  const user = record && (await User.findById(record.user))
  if (user) {
    await notifyUser(user._id, "We could not complete your enrollment, so your payment is being refunded.", "/dashboard/enrolled-courses")
    await mailSender(user.email, "Your payment is being refunded", refundEmail(`${user.firstName} ${user.lastName}`, amount)).catch((error) =>
      logger.warn({ err: error.message }, "refund email not sent")
    )
  }
}

module.exports = { handleRefund }
