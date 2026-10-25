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
  refresh,
  getSessions,
  revokeSession,
  logoutAll,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  loginTwoFactor,
} = require("../controllers/Security")
const {
  resetPasswordToken,
  resetPassword,
} = require("../controllers/resetPassword")

const { auth, optionalAuth } = require("../middleware/auth")
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
  loginTwoFactorSchema,
  twoFactorCodeSchema,
  disableTwoFactorSchema,
  revokeSessionSchema,
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

// Second login step for accounts with two-factor authentication.
router.post("/login/2fa", authLimiter, validate(loginTwoFactorSchema), loginTwoFactor)

// The refresh cookie is sent automatically by the browser, so a cross-site page
// could try to trigger a refresh. Requiring a custom header forces a CORS
// preflight, which other origins fail.
const requireXhr = (req, res, next) =>
  req.get("X-Requested-With") === "XMLHttpRequest"
    ? next()
    : res.status(403).json({ success: false, message: "Missing X-Requested-With header" })

// New access token from the refresh-token cookie (rotates the cookie).
router.post("/refresh", requireXhr, refresh)

// Ends the current session (access token + its refresh-token family). Works
// with only the refresh cookie too, so an expired access token can still log out.
router.post("/logout", requireXhr, optionalAuth, logout)
router.post("/logout-all", auth, logoutAll)
router.get("/sessions", auth, getSessions)
router.post("/sessions/revoke", auth, validate(revokeSessionSchema), revokeSession)

// Two-factor authentication (TOTP) management.
router.post("/2fa/setup", auth, setupTwoFactor)
router.post("/2fa/enable", auth, validate(twoFactorCodeSchema), enableTwoFactor)
router.post("/2fa/disable", auth, validate(disableTwoFactorSchema), disableTwoFactor)

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
