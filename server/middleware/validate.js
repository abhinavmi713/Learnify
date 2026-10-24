// Wraps a Zod schema as Express middleware. Validates req.body (or req.query,
// via `source`) before the controller runs, so every write endpoint that opts
// in gets the same consistent 400 response shape for bad input instead of
// each controller hand-rolling its own subset of checks.
function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      return res.status(400).json({
        success: false,
        message: firstIssue
          ? `${firstIssue.path.join(".") || "request"}: ${firstIssue.message}`
          : "Invalid request",
      })
    }
    // Replace with the parsed (coerced/defaulted) data so controllers see
    // clean, typed values.
    req[source] = result.data
    next()
  }
}

module.exports = { validate }
