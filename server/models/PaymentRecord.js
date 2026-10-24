const mongoose = require("mongoose")

// One row per fulfilled purchase. Beyond being the missing order/transaction
// history, the unique `orderId` is what makes fulfillment idempotent: the
// browser's verifyPayment call and Razorpay's webhook can both report the same
// payment, and whichever arrives second must not double-count a coupon.
const paymentRecordSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
    amount: { type: Number, required: true }, // rupees actually charged
    couponCode: { type: String, default: null },
    source: { type: String, enum: ["verify", "webhook", "free"], required: true },
    // fulfilled      purchase delivered
    // refund_pending payment captured but enrollment failed; a refund was queued
    // refunded       refund completed
    // refund_failed  refund attempt failed (will retry, then needs a human)
    status: {
      type: String,
      enum: ["fulfilled", "refund_pending", "refunded", "refund_failed"],
      default: "fulfilled",
    },
    failureReason: { type: String, default: null },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

module.exports = mongoose.model("PaymentRecord", paymentRecordSchema)
