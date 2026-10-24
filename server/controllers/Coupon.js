const mongoose = require("mongoose")
const Coupon = require("../models/Coupon")
const Course = require("../models/Course")
const { findRedeemableCoupon, computeDiscount } = require("../utils/coupon")
const { getPagination, buildPaginationMeta } = require("../utils/pagination")

// Admin-only: create a coupon
exports.createCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, maxUses, expiresAt } = req.body

    if (!code || !discountType || !discountValue) {
      return res.status(400).json({
        success: false,
        message: "code, discountType and discountValue are required",
      })
    }
    if (!["percentage", "flat"].includes(discountType)) {
      return res.status(400).json({
        success: false,
        message: "discountType must be 'percentage' or 'flat'",
      })
    }
    const numericValue = Number(discountValue)
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return res.status(400).json({
        success: false,
        message: "discountValue must be a positive number",
      })
    }
    if (discountType === "percentage" && numericValue > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100",
      })
    }

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: numericValue,
      maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt || null,
      createdBy: req.user.id,
    })

    return res.status(201).json({ success: true, data: coupon })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A coupon with this code already exists",
      })
    }
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to create coupon" })
  }
}

// Admin-only: list all coupons
exports.getAllCoupons = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const [coupons, total] = await Promise.all([
      Coupon.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Coupon.countDocuments({}),
    ])
    return res
      .status(200)
      .json({ success: true, data: coupons, pagination: buildPaginationMeta(total, page, limit) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch coupons" })
  }
}

// Admin-only: activate/deactivate a coupon
exports.setCouponActive = async (req, res) => {
  try {
    const { couponId, active } = req.body
    if (!couponId || typeof active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "couponId and boolean 'active' are required",
      })
    }
    const coupon = await Coupon.findByIdAndUpdate(
      couponId,
      { active },
      { new: true }
    )
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" })
    }
    return res.status(200).json({ success: true, data: coupon })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to update coupon" })
  }
}

// Student-facing: preview the discount a coupon would apply to the current cart.
// This is a preview only — the authoritative check happens again at payment time.
exports.validateCoupon = async (req, res) => {
  try {
    const { code, courses } = req.body

    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({ success: false, message: "No courses provided" })
    }
    if (!courses.every((id) => mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: "Invalid course ID" })
    }

    const { coupon, error } = await findRedeemableCoupon(code)
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }

    const courseDocs = await Course.find({ _id: { $in: courses } })
    const subtotal = courseDocs.reduce((sum, c) => sum + c.price, 0)
    const discount = computeDiscount(coupon, subtotal)

    return res.status(200).json({
      success: true,
      data: {
        code: coupon.code,
        subtotal,
        discount,
        total: subtotal - discount,
      },
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to validate coupon" })
  }
}
