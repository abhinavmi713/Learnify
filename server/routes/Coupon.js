const express = require("express")
const router = express.Router()

const {
  createCoupon,
  getAllCoupons,
  setCouponActive,
  validateCoupon,
} = require("../controllers/Coupon")
const { auth, requirePermission } = require("../middleware/auth")
const { audited } = require("../utils/audit")
const { idempotent } = require("../middleware/idempotency")
const { setCouponActiveSchema, validateCouponSchema } = require("../validators/miscValidators")
const { validate } = require("../middleware/validate")
const { createCouponSchema } = require("../validators/couponValidators")

const manage = requirePermission("coupon:manage")

router.post(
  "/create",
  auth,
  manage,
  idempotent(),
  audited("coupon.create", (req) => ({ targetType: "coupon", targetId: req.body?.code, metadata: { discountType: req.body?.discountType, discountValue: req.body?.discountValue } })),
  validate(createCouponSchema),
  createCoupon
)
router.get("/all", auth, manage, getAllCoupons)
router.post(
  "/set-active",
  auth,
  manage,
  audited("coupon.set_active", (req) => ({ targetType: "coupon", targetId: req.body?.couponId, metadata: { active: Boolean(req.body?.active) } })),
  validate(setCouponActiveSchema),
  setCouponActive
)
router.post("/validate", auth, requirePermission("coupon:redeem"), validate(validateCouponSchema), validateCoupon)
module.exports = router
