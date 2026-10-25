const mongoose = require("mongoose")

// One row per issued refresh token. Only a SHA-256 hash is stored, so a database
// leak does not hand out working sessions.
//
// Tokens from one login form a "family". Each refresh marks the presented token
// used and issues the next one in the same family. If a token that was already
// used is presented again, someone is replaying a stolen copy, so the whole
// family (every session descended from that login) is revoked.
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    family: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    // tokenVersion of the user when issued: a password change ends every session.
    tokenVersion: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    // Hard limit for the whole family, however often it is refreshed.
    familyExpiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
)

// Rows disappear on their own once the family can no longer be used.
refreshTokenSchema.index({ familyExpiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model("RefreshToken", refreshTokenSchema)
