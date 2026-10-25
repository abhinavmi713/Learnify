const mongoose = require("mongoose")

// Append-only record of security-relevant actions: who did what, to what, from
// where, and whether it succeeded. Written by utils/audit.js; read by admins.
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    outcome: { type: String, enum: ["success", "failure"], default: "success" },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    actorRole: { type: String, default: null },
    actorEmail: { type: String, default: null },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    requestId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ actor: 1, createdAt: -1 })

// Entries are never edited or removed through the application.
function immutable() {
  throw new Error("Audit log entries are append-only")
}
for (const op of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
]) {
  auditLogSchema.pre(op, immutable)
}
auditLogSchema.pre("save", function () {
  if (!this.isNew) immutable()
})

module.exports = mongoose.model("AuditLog", auditLogSchema)
