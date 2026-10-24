const logger = require("../utils/logger")

// Catches anything that reaches Express without being handled by a route's
// own try/catch — malformed JSON bodies, errors thrown synchronously, or
// anything passed to next(err). Every controller already handles its own
// errors and responds with a safe message; this is the last-resort net so
// an unexpected failure never leaks a raw stack trace or Mongoose error
// string to the client.
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error")

  // express.json() throws a SyntaxError with a `status` of 400 for malformed bodies.
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ success: false, message: "Malformed request body" })
  }

  return res.status(err.status || 500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  })
}

function notFoundHandler(req, res) {
  return res.status(404).json({ success: false, message: "Route not found" })
}

module.exports = { errorHandler, notFoundHandler }
