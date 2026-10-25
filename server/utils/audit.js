const AuditLog = require("../models/AuditLog")
const logger = require("./logger")

// Records one audit entry. Never throws: failing to write an audit row must not
// fail the action itself, but it is logged loudly so it can be investigated.
async function recordAudit(req, { action, outcome = "success", actor, targetType, targetId, metadata } = {}) {
  const who = actor || req?.authUser || null
  try {
    await AuditLog.create({
      action,
      outcome,
      actor: who?._id || who?.id || null,
      actorRole: who?.accountType || null,
      actorEmail: who?.email || null,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      metadata: metadata || {},
      ip: req?.ip || "",
      userAgent: String(req?.get?.("user-agent") || "").slice(0, 300),
      requestId: req?.id ? String(req.id) : null,
    })
  } catch (error) {
    logger.error({ err: error.message, action }, "could not write audit log entry")
  }
}

// Route middleware: records `action` once the response is sent, with outcome
// taken from the status code. `describe(req, res)` may return
// { targetType, targetId, metadata }.
function audited(action, describe = () => ({})) {
  return (req, res, next) => {
    res.on("finish", () => {
      let details = {}
      try {
        details = describe(req, res) || {}
      } catch (error) {
        details = {}
      }
      recordAudit(req, {
        action,
        outcome: res.statusCode < 400 ? "success" : "failure",
        ...details,
        metadata: { status: res.statusCode, ...(details.metadata || {}) },
      })
    })
    next()
  }
}

module.exports = { recordAudit, audited }
