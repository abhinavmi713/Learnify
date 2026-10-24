const express = require("express")
const router = express.Router()

const {
  createCoupon,
  getAllCoupons,
  setCouponActive,
  validateCoupon,
} = require("../controllers/Coupon")
const { auth, isAdmin, isStudent } = require("../middleware/auth")
const { setCouponActiveSchema, validateCouponSchema } = require("../validators/miscValidators")
const { validate } = require("../middleware/validate")
const { createCouponSchema } = require("../validators/couponValidators")

router.post("/create", auth, isAdmin, validate(createCouponSchema), createCoupon)
router.get("/all", auth, isAdmin, getAllCoupons)
router.post("/set-active", auth, isAdmin, validate(setCouponActiveSchema), setCouponActive)
router.post("/validate", auth, isStudent, validate(validateCouponSchema), validateCoupon)
module.exports = router
