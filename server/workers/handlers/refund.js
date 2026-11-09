const PaymentRecord = require("../../models/PaymentRecord")
const User = require("../../models/User")
const mailSender = require("../../utils/mailSender")
const logger = require("../../utils/logger")
const { getInstance } = require("../../config/razorpay")
const { withBreaker, withTimeout } = require("../../utils/resilience")
const { notifyUser } = require("../../utils/notify")
const { refundEmail } = require("../../mail/templates/simpleEmails")
const { recordAudit } = require("../../utils/audit")
const { runInTransaction } = require("../../utils/transaction")

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

// A claim older than this belongs to a worker that died; it can be taken over.
const STALE_CLAIM_MS = 10 * 60 * 1000

class RefundInProgress extends Error {}

// Two copies of a refund event can arrive at the same time. Only the one that
// moves the record from "waiting" to "processing" may call Razorpay; the other
// throws so the queue checks again later (by then it's done, or the claim is stale).
async function claim(filterWaiting, field, status) {
  const stale = new Date(Date.now() - STALE_CLAIM_MS)
  return PaymentRecord.findOneAndUpdate(
    { $or: [filterWaiting, { [status.field]: status.processing, [field]: { $lt: stale } }], ...status.extra },
    { $set: { [status.field]: status.processing, [field]: new Date() } },
    { new: true }
  )
}

async function handlePartialRefund({ orderId, paymentId, amount, reason }) {
  const record = await claim(
    { orderId, "partialRefund.status": { $in: ["pending", "failed"] } },
    "partialRefund.claimedAt",
    { field: "partialRefund.status", processing: "processing", extra: { orderId } }
  )
  if (!record) {
    const current = await PaymentRecord.findOne({ orderId }).lean()
    if (!current || current.partialRefund?.status === "refunded") return
    throw new RefundInProgress(`partial refund for ${orderId} is being processed`)
  }

  try {
    if (!(await partialRefundExists(paymentId, orderId))) {
      await callRefund(paymentId, Math.round(amount * 100), { orderId, reason: String(reason || "").slice(0, 200) })
    }
  } catch (error) {
    await PaymentRecord.updateOne({ orderId }, { $set: { "partialRefund.status": "failed" } })
    throw error // the queue retries; after the last attempt it lands in the DLQ for a human
  }

  // The new status and its audit entry commit together.
  await runInTransaction(async (session) => {
    await PaymentRecord.updateOne(
      { orderId },
      { $set: { "partialRefund.status": "refunded", "partialRefund.refundedAt": new Date() } },
      session ? { session } : {}
    )
    await recordAudit(null, { action: "payment.partially_refunded", targetType: "payment", targetId: orderId, metadata: { amount, reason }, session: session || undefined })
  })
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
  const record = await claim(
    { orderId, status: { $in: ["refund_pending", "refund_failed"] } },
    "refundClaimedAt",
    { field: "status", processing: "refund_processing", extra: { orderId } }
  )
  if (!record) {
    const current = await PaymentRecord.findOne({ orderId }).lean()
    if (!current || current.status === "refunded") return
    throw new RefundInProgress(`refund for ${orderId} is being processed`)
  }

  try {
    await callRefund(paymentId, Math.round(amount * 100), { orderId, reason: String(reason || "").slice(0, 200) })
  } catch (error) {
    if (!alreadyRefunded(error)) {
      await PaymentRecord.updateOne({ orderId }, { $set: { status: "refund_failed" } })
      throw error // the queue retries; after the last attempt it lands in the DLQ for a human
    }
  }

  await runInTransaction(async (session) => {
    await PaymentRecord.updateOne({ orderId }, { $set: { status: "refunded", refundedAt: new Date() } }, session ? { session } : {})
    await recordAudit(null, { action: "payment.refunded", targetType: "payment", targetId: orderId, metadata: { amount, reason }, session: session || undefined })
  })
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
