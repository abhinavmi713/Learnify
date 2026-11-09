const Coupon = require("../models/Coupon")
const PaymentRecord = require("../models/PaymentRecord")

// Looks up a coupon by code and checks it is currently redeemable.
// Returns { coupon } on success or { error: "..." } on failure — never throws.
async function findRedeemableCoupon(code, userId = null) {
  if (!code || typeof code !== "string") {
    return { error: "Please provide a coupon code" }
  }

  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() })
  if (!coupon || !coupon.active) {
    return { error: "Invalid coupon code" }
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { error: "This coupon has expired" }
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { error: "This coupon has reached its usage limit" }
  }
  if (coupon.perUserLimit && userId) {
    const used = await PaymentRecord.countDocuments({ user: userId, couponCode: coupon.code, status: { $ne: "refunded" } })
    if (used >= coupon.perUserLimit) return { error: "You have already used this coupon" }
  }

  return { coupon }
}

// Computes the discount amount (in rupees) for a given subtotal.
// Never returns more than the subtotal itself.
function computeDiscount(coupon, subtotal) {
  let discount =
    coupon.discountType === "percentage"
      ? (subtotal * coupon.discountValue) / 100
      : coupon.discountValue

  discount = Math.max(0, Math.round(discount))
  return Math.min(discount, subtotal)
}

module.exports = { findRedeemableCoupon, computeDiscount }
