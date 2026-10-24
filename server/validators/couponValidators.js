const { z } = require("zod")

const emptyToUndefined = (val) => (val === "" || val === null ? undefined : val)

const createCouponSchema = z.object({
  code: z.string().trim().min(3, "Coupon code must be at least 3 characters"),
  discountType: z.enum(["percentage", "flat"]),
  discountValue: z.coerce.number().positive("discountValue must be a positive number"),
  maxUses: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  // The frontend sends a plain <input type="date"> value (e.g. "2026-12-31"),
  // not a full ISO datetime — coerce rather than requiring strict ISO 8601.
  expiresAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
})

module.exports = { createCouponSchema }
