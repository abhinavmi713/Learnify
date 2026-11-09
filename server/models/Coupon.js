const mongoose = require("mongoose")

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "flat"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 1,
    },
    maxUses: {
      type: Number,
      default: null, // null = unlimited
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    // Uses held for checkouts in progress (M17). A limited coupon is reserved when
    // the order is created and turned into a use when it's paid, so the limit is
    // checked against used + reserved, not just used. Each expires on its own.
    reservations: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          expiresAt: { type: Date, required: true },
          _id: false,
        },
      ],
      default: [],
    },
    // How many orders one student may use it on. null = no per-student limit.
    perUserLimit: {
      type: Number,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null, // null = never expires
    },
    active: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model("Coupon", couponSchema)
