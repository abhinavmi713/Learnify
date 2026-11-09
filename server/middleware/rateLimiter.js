const rateLimit = require("express-rate-limit")
const { RedisRateStore } = require("../utils/redisRateStore")

// Rate limits exist to shape real traffic, not to be exercised by the test
// suite — without this, a handful of test cases hitting the same endpoint
// trips the limiter and turns unrelated assertions into flaky 429s.
const skipInTests = () => process.env.NODE_ENV === "test"

// Applies to login, signup, OTP request/verification and password-reset
// endpoints — the routes most exposed to credential stuffing, OTP brute
// forcing, and user-enumeration probing.
// Each action has its own counter, so a shared college or office address isn't
// locked out of signing in because others there signed up or reset passwords.
// Successful logins don't count: only failures suggest guessing.
const authLimit = (name, { max = 10, skipSuccessfulRequests = false } = {}) =>
  rateLimit({
    // Shared across API instances when Redis is configured.
    store: new RedisRateStore(name),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipInTests,
    message: {
      success: false,
      message: "Too many attempts. Please try again after some time.",
    },
  })

exports.loginLimiter = authLimit("loginLimiter", { max: 10, skipSuccessfulRequests: true })
exports.twoFactorLimiter = authLimit("twoFactorLimiter", { max: 10, skipSuccessfulRequests: true })
exports.signupLimiter = authLimit("signupLimiter", { max: 10 })
exports.otpLimiter = authLimit("otpLimiter", { max: 10 })
exports.passwordResetLimiter = authLimit("passwordResetLimiter", { max: 10 })

// Applies to the chatbot proxy, which spends a paid Gemini API quota per call.
exports.chatbotLimiter = rateLimit({
  // Shared across API instances when Redis is configured.
  store: new RedisRateStore("chatbotLimiter"),
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    error: "Too many requests. Please slow down and try again shortly.",
  },
})

// Applies to AI-assist endpoints (quiz draft generation, course description
// assist) — heavier prompts than the chatbot, so a tighter cap.
exports.aiLimiter = rateLimit({
  // Shared across API instances when Redis is configured.
  store: new RedisRateStore("aiLimiter"),
  windowMs: 60 * 1000, // 1 minute
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many AI requests. Please slow down and try again shortly.",
  },
})

// The contact form is unauthenticated and sends an email, so without a cap it
// is a free spam relay.
exports.contactLimiter = rateLimit({
  // Shared across API instances when Redis is configured.
  store: new RedisRateStore("contactLimiter"),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many messages sent. Please try again later.",
  },
})

// Blanket ceiling for the whole API so no endpoint is completely unthrottled
// (the specific limiters above are much tighter where abuse is costly).
exports.generalLimiter = rateLimit({
  // Shared across API instances when Redis is configured.
  store: new RedisRateStore("generalLimiter"),
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipInTests() || req.path === "/payment/webhook",
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
})
