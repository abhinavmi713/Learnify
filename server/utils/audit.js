const AuditLog = require("../models/AuditLog")
const logger = require("./logger")
const { auditWriteFailures } = require("./metrics")

// Records one audit entry.
//
// Inside a transaction (pass `session`), the entry commits or aborts with the
// change it describes, and a failed write throws, so a refund can't be recorded
// as done without its audit entry, or the reverse. Use it for high-value actions.
//
// Otherwise it never throws: failing to write an audit row must not fail the
// action itself. The failure is logged and counted
// (learnify_audit_write_failures_total), so lost entries are visible.
//
// Every entry is also written to the application log as an "audit" line, a copy
// outside the database that someone with database access can't quietly edit.
async function recordAudit(req, { action, outcome = "success", actor, targetType, targetId, metadata, session } = {}) {
  const who = actor || req?.authUser || null
  // req is null for background work (the refund worker, Razorpay webhooks).
  const entry = {
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
  }
  try {
    if (session) await AuditLog.create([entry], { session })
    else await AuditLog.create(entry)
    logger.info({ audit: { ...entry, actor: entry.actor ? String(entry.actor) : null } }, "audit")
  } catch (error) {
    if (session) throw error
    auditWriteFailures.inc({ action })
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
