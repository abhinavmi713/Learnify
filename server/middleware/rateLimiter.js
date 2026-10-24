const rateLimit = require("express-rate-limit")
const { RedisRateStore } = require("../utils/redisRateStore")

// Rate limits exist to shape real traffic, not to be exercised by the test
// suite — without this, a handful of test cases hitting the same endpoint
// trips the limiter and turns unrelated assertions into flaky 429s.
const skipInTests = () => process.env.NODE_ENV === "test"

// Applies to login, signup, OTP request/verification and password-reset
// endpoints — the routes most exposed to credential stuffing, OTP brute
// forcing, and user-enumeration probing.
exports.authLimiter = rateLimit({
  // Shared across API instances when Redis is configured.
  store: new RedisRateStore("authLimiter"),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Too many attempts. Please try again after some time.",
  },
})

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
