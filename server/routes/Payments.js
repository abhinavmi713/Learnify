// Import the required modules
const express = require("express")
const router = express.Router()
const {
  capturePayment,
  // verifySignature,
  verifyPayment,
  razorpayWebhook,
} = require("../controllers/payments")
const { auth, requirePermission } = require("../middleware/auth")
const { idempotent } = require("../middleware/idempotency")
const { validate } = require("../middleware/validate")
const { capturePaymentSchema, verifyPaymentSchema } = require("../validators/miscValidators")

// A double-clicked "Buy" or a retried request must not create two orders (or
// enroll twice for free courses): the client sends one Idempotency-Key per
// checkout attempt and a repeat gets the first response back.
const purchase = requirePermission("course:purchase")
router.post("/capturePayment", auth, purchase, validate(capturePaymentSchema), idempotent(), capturePayment)
router.post("/verifyPayment", auth, purchase, validate(verifyPaymentSchema), idempotent(), verifyPayment)
// Called by Razorpay's servers, not a logged-in user — authenticated by the
// HMAC signature over the raw request body instead of a JWT.
router.post("/webhook", razorpayWebhook)

module.exports = router
