const { revokeAllSessions } = require("../utils/sessions")
const { recordAudit } = require("../utils/audit")
const User = require("../models/User")
const { enqueueEvent } = require("../events/outbox")
const { EVENTS } = require("../events/types")
const bcrypt = require("bcryptjs")
const crypto = require("crypto")
const logger = require("../utils/logger")

// Generic response used for both existing and non-existing emails so an
// attacker cannot use this endpoint to enumerate registered accounts.
const GENERIC_SENT_MESSAGE =
  "If an account with that email exists, a password reset link has been sent."

exports.resetPasswordToken = async (req, res) => {
  try {
    const email = req.body.email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email address",
      })
    }

    const user = await User.findOne({ email })

    if (user) {
      // Only the hash is stored; the raw token is emailed to the user and
      // never persisted, so a database leak alone can't be used to reset
      // this user's password.
      const rawToken = crypto.randomBytes(32).toString("hex")
      const hashedToken = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex")

      await User.findOneAndUpdate(
        { email },
        {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: Date.now() + 15 * 60 * 1000, // 15 minutes
        },
        { new: true }
      )

      const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim()
      const url = `${clientUrl}/update-password/${rawToken}`

      // Fire-and-forget so a mail outage can't turn into a different response
      // for existing vs. non-existing accounts (which would let someone
      // enumerate registered emails).
      // Queued, not sent here: delivery happens in a worker, so a mail outage
      // cannot change the response (which would reveal whether an account exists).
      await enqueueEvent(EVENTS.PASSWORD_RESET_REQUESTED, { email, url })
      if (!["production", "test"].includes(process.env.NODE_ENV)) {
        logger.info({ url }, "DEV ONLY: password reset link")
      }
    }

    // Same response whether or not the account exists.
    res.json({
      success: true,
      message: GENERIC_SENT_MESSAGE,
    })
  } catch (error) {
    console.error("Error in resetPasswordToken:", error)
    return res.status(500).json({
      success: false,
      message: "Some error occurred while sending the reset message",
    })
  }
}

exports.resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword, token } = req.body

    if (!password || !confirmPassword || !token) {
      return res.status(400).json({
        success: false,
        message: "Please provide password, confirm password and token",
      })
    }

    if (confirmPassword !== password) {
      return res.status(400).json({
        success: false,
        message: "Password and Confirm Password do not match",
      })
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex")
    const userDetails = await User.findOne({ resetPasswordToken: hashedToken })

    if (!userDetails) {
      return res.status(400).json({
        success: false,
        message: "Token is invalid",
      })
    }
    if (!(userDetails.resetPasswordExpires > Date.now())) {
      return res.status(403).json({
        success: false,
        message: "Token is expired, please regenerate your token",
      })
    }

    const encryptedPassword = await bcrypt.hash(password, 10)
    // Invalidate the reset token immediately so it cannot be reused
    // (single-use), and bump tokenVersion so any JWT issued before this
    // reset — e.g. from whoever's session prompted the reset — stops working.
    await User.findOneAndUpdate(
      { _id: userDetails._id },
      {
        $set: { password: encryptedPassword },
        $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
        $inc: { tokenVersion: 1 },
      },
      { new: true }
    )

    await revokeAllSessions(userDetails._id, "password_reset")
    await recordAudit(req, { action: "auth.password_reset", actor: userDetails, targetType: "user", targetId: userDetails._id })

    res.json({
      success: true,
      message: "Password reset successful",
    })
  } catch (error) {
    console.error("Error in resetPassword:", error)
    return res.status(500).json({
      success: false,
      message: "Some error occurred while updating the password",
    })
  }
}
