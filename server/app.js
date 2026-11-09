// Builds and exports the Express app only — no DB/Cloudinary connection and
// no app.listen() here, so tests (supertest) can import this directly
// against an isolated in-memory database without touching production
// services. index.js is the actual entrypoint that wires those up and
// starts listening.
const express = require("express");
// Express 4 ignores a rejected async handler, leaving the request hanging. This
// sends those rejections to errorHandler. Must load before any routes are made.
require("express-async-errors");
require("./config/mongoose");
const app = express();

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");
const { httpMetrics, metricsHandler } = require("./utils/metrics");
const swaggerUi = require("swagger-ui-express");
const { buildSpec } = require("./openapi/generate");
const webhookRoutes = require("./routes/webhooks");

dotenv.config();

// Import routes
const userRoutes = require("./routes/user");
const profileRoutes = require("./routes/profile");
const courseRoutes = require("./routes/Course");
const paymentRoutes = require("./routes/Payments");
const couponRoutes = require("./routes/Coupon");
const noteRoutes = require("./routes/Note");
const quizRoutes = require("./routes/Quiz");
const certificateRoutes = require("./routes/Certificate");
const adminRoutes = require("./routes/Admin");
const notificationRoutes = require("./routes/Notification");
const discussionRoutes = require("./routes/Discussion");
const liveClassRoutes = require("./routes/LiveClass");
const internalRoutes = require("./routes/internal");
const learningPathRoutes = require("./routes/LearningPath");
const contactUsRoute = require("./routes/Contact");
const chatBotRoute = require("./routes/chatbot");

const { registerCheck, runChecks } = require("./utils/health");
const logger = require("./utils/logger");

// Error tracking is opt-in: with no SENTRY_DSN set this does nothing and the
// SDK is never even loaded.
let Sentry = null;
if (process.env.SENTRY_DSN) {
  Sentry = require("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0,
  });
}
const { generalLimiter } = require("./middleware/rateLimiter");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

// Behind a reverse proxy / load balancer, every request appears to come from
// the proxy's IP unless Express is told how many proxy hops to trust — which
// would collapse all users into one rate-limit bucket. Opt-in via env because
// trusting the header when there is NO proxy lets clients spoof their IP.
//   TRUST_PROXY=1        one hop (typical: a single load balancer / PaaS router)
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

// Middleware setup
app.use(httpMetrics);
app.use(helmet());
if (process.env.NODE_ENV !== "test") {
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/" || req.url === "/health" } }));
}
// CORS runs before body parsing, so a malformed body's 400 still carries CORS
// headers and the browser reports the real error instead of a CORS failure.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
// Keep the raw bytes of the Razorpay webhook body: its signature is computed
// over the exact payload, which re-serialising the parsed JSON can't reproduce.
app.use(
  express.json({
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith("/api/v1/payment/webhook")) req.rawBody = buf;
    },
  })
);
app.use(cookieParser());


// Mount routes
app.use("/api/v1", generalLimiter);
app.use("/api/v1/auth", userRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/course", courseRoutes);
app.use("/api/v1/payment", paymentRoutes);
app.use("/api/v1/coupon", couponRoutes);
app.use("/api/v1/notes", noteRoutes);
app.use("/api/v1/quiz", quizRoutes);
app.use("/api/v1/certificate", certificateRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/notification", notificationRoutes);
app.use("/api/v1/discussion", discussionRoutes);
app.use("/api/v1/live-class", liveClassRoutes);
// Service-to-service API (AI service); token-protected, not for browsers.
app.use("/api/v1/internal", internalRoutes);
app.use("/api/v1/learning-path", learningPathRoutes);
app.use("/api/v1/reach", contactUsRoute);
app.use("/api/v1/chatbot", chatBotRoute);
app.use("/api/v1/webhooks", webhookRoutes);

// Liveness/readiness probe for load balancers and uptime monitors.
registerCheck(
  "mongo",
  () => {
    if (mongoose.connection.readyState !== 1) throw new Error("disconnected");
  },
  { critical: true }
);

// API documentation, generated from the routes themselves (openapi/generate.js).
// Built on first request so every router is mounted by then.
let openapiSpec = null;
// Service-to-service routes are left out of the published spec.
const publicSpec = (spec) => ({
  ...spec,
  paths: Object.fromEntries(Object.entries(spec.paths || {}).filter(([path]) => !path.startsWith("/api/v1/internal"))),
});
const getSpec = () => (openapiSpec ||= publicSpec(buildSpec(app, { version: require("./package.json").version })));
// Public in development; in production only when DOCS_PUBLIC=1.
const docsEnabled = (req, res, next) =>
  process.env.NODE_ENV !== "production" || process.env.DOCS_PUBLIC === "1" ? next() : notFoundHandler(req, res);
app.get("/api/openapi.json", docsEnabled, (req, res) => res.json(getSpec()));
app.use(
  "/api/docs",
  docsEnabled,
  // Swagger UI needs inline scripts/styles; relax CSP for this page only.
  (req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
    next();
  },
  swaggerUi.serve,
  (req, res, next) => swaggerUi.setup(getSpec(), { customSiteTitle: "Learnify API" })(req, res, next)
);

// Prometheus scrape endpoint (see utils/metrics.js for access rules).
app.get("/metrics", metricsHandler);

app.get("/health", async (req, res) => {
  const { ok, dependencies } = await runChecks();
  return res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    // Kept for existing monitors that read `db`.
    db: dependencies.mongo?.status === "up" ? "connected" : "disconnected",
    dependencies,
    uptime: Math.round(process.uptime()),
  });
});

// Root test route
app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "Your server is up and running ...",
  });
});

// Must come after the routes and before our own error handler.
if (Sentry) Sentry.setupExpressErrorHandler(app);

// Anything past this point is unmatched by any route above.
app.use(notFoundHandler);
// Must be registered last: catches errors from any middleware/route above it.
app.use(errorHandler);

module.exports = app;
