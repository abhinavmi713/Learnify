// Import the required modules
const express = require("express")
const router = express.Router()

// Import the required controllers and middleware functions
const {
  login,
  signup,
  sendotp,
  changePassword,
  logout,
} = require("../controllers/Auth")
const {
  resetPasswordToken,
  resetPassword,
} = require("../controllers/resetPassword")

const { auth } = require("../middleware/auth")
const { authLimiter } = require("../middleware/rateLimiter")
const { validate } = require("../middleware/validate")
const { tokenBucketLimiter } = require("../utils/tokenBucket")
const {
  signupSchema,
  loginSchema,
  sendOtpSchema,
  changePasswordSchema,
  resetPasswordTokenSchema,
  resetPasswordSchema,
} = require("../validators/authValidators")

// Routes for Login, Signup, and Authentication

// ********************************************************************************************************
//                                      Authentication routes
// ********************************************************************************************************

// Route for user login
// Two layers: authLimiter caps attempts per IP; the bucket caps attempts per
// target account, so a botnet rotating IPs still cannot guess one password fast.
const loginBucket = tokenBucketLimiter({
  name: "login",
  capacity: 8,
  refillPerSec: 1 / 30,
  keyFn: (req) => String(req.body?.email || "").trim().toLowerCase(),
  message: "Too many login attempts for this account. Please wait a little before trying again.",
})
router.post("/login", authLimiter, loginBucket, validate(loginSchema), login)

// Ends the current session (revokes this token).
router.post("/logout", auth, logout)

// Route for user signup
router.post("/signup", authLimiter, validate(signupSchema), signup)

// Route for sending OTP to the user's email
router.post("/sendotp", authLimiter, validate(sendOtpSchema), sendotp)

// Route for Changing the password
router.post("/changepassword", auth, validate(changePasswordSchema), changePassword)

// ********************************************************************************************************
//                                      Reset Password
// ********************************************************************************************************

// Route for generating a reset password token
router.post(
  "/reset-password-token",
  authLimiter,
  validate(resetPasswordTokenSchema),
  resetPasswordToken
)

// Route for resetting user's password after verification
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), resetPassword)

// Export the router for use in the main application
module.exports = router
