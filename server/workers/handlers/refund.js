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

// Compensating action of the checkout saga. Payment was captured but we could
// not deliver the purchase, so give the money back. Safe to run repeatedly: it
// first checks the record, and Razorpay refuses a second full refund.
async function handleRefund(event) {
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
