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

// How long a checkout may hold a limited coupon before paying.
const RESERVATION_MS = 30 * 60 * 1000

// Reserves one use of a limited coupon for this student's checkout. Atomic: the
// push only happens while used + live reservations is below maxUses, so five
// shoppers racing for the last use can't all get it. Unlimited coupons need no
// reservation. Returns true when the student may use it.
async function reserveCouponUse(code, userId) {
  const now = new Date()
  // Drop expired holds, and this student's own earlier hold (a new checkout replaces it).
  await Coupon.updateOne({ code }, { $pull: { reservations: { $or: [{ expiresAt: { $lte: now } }, { user: userId }] } } })
  const reserved = await Coupon.findOneAndUpdate(
    {
      code,
      $or: [
        { maxUses: null },
        {
          $expr: {
            $lt: [
              { $add: ["$usedCount", { $size: { $filter: { input: "$reservations", cond: { $gt: ["$$this.expiresAt", now] } } } }] },
              "$maxUses",
            ],
          },
        },
      ],
    },
    { $push: { reservations: { user: userId, expiresAt: new Date(now.getTime() + RESERVATION_MS) } } },
    { new: true }
  )
  return Boolean(reserved)
}

// Gives a reserved use back, for a checkout that didn't go ahead.
async function releaseCouponReservation(code, userId) {
  await Coupon.updateOne({ code }, { $pull: { reservations: { user: userId } } })
}

module.exports = { findRedeemableCoupon, computeDiscount, reserveCouponUse, releaseCouponReservation, RESERVATION_MS }
