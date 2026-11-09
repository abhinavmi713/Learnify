const logger = require("../utils/logger")

// Catches anything a route doesn't handle itself: malformed JSON bodies, thrown
// errors, anything passed to next(err), and rejected async handlers (through
// express-async-errors in app.js). It answers with a safe message, so an
// unexpected failure never leaks a stack trace or database error to the client.
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
