const bcrypt = require("bcryptjs")
const User = require("../models/User")
const OTP = require("../models/OTP")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const { runInTransaction } = require("../utils/transaction")
const { enqueueEvent } = require("../events/outbox")
const { EVENTS } = require("../events/types")
const { revokeToken } = require("../utils/tokenRevocation")
const logger = require("../utils/logger")
const { passwordUpdated } = require("../mail/templates/passwordUpdate")
const Profile = require("../models/Profile")
require("dotenv").config()

// Signup Controller for Registering USers

exports.signup = async (req, res) => {
  try {
    // Destructure fields from the request body
    const {
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      accountType,
      contactNumber,
      otp,
    } = req.body
    // Check if All Details are there or not
    if (
      !firstName ||
      !lastName ||
      !email ||
      !password ||
      !confirmPassword ||
      !otp
    ) {
      return res.status(403).send({
        success: false,
        message: "All Fields are required",
      })
    }
    // Check if password and confirm password match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Password and Confirm Password do not match. Please try again.",
      })
    }

    // Public signup may only ever create a Student or Instructor account.
    // Admin accounts must never be reachable through this endpoint — accepting
    // whatever the client sends here would let anyone self-promote to Admin.
    const ALLOWED_SIGNUP_ACCOUNT_TYPES = ["Student", "Instructor"]
    if (!ALLOWED_SIGNUP_ACCOUNT_TYPES.includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account type",
      })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists. Please sign in to continue.",
      })
    }

    // Find the most recent OTP for the email
    const response = await OTP.find({ email }).sort({ createdAt: -1 }).limit(1)
    if (response.length === 0) {
      // OTP not found for the email
      return res.status(400).json({
        success: false,
        message: "The OTP is not valid",
      })
    } else if (otp !== response[0].otp) {
      // Invalid OTP
      return res.status(400).json({
        success: false,
        message: "The OTP is not valid",
      })
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Instructors are intentionally NOT gated behind a separate approval
    // step: the real quality gate is course moderation (an instructor can
    // never publish — an admin must approve each course). The old code here
    // tried to flag instructors as unapproved but compared an empty string
    // to "Instructor", so it always evaluated to `true`.
    const approved = true

    // Create the Additional Profile For User
    // Profile, user and the "user.registered" event commit together, so a new
    // account always gets its welcome email queued and never a half-made profile.
    const user = await runInTransaction(async (session) => {
      const opts = session ? { session } : {}
      const [profileDetails] = await Profile.create(
        [{ gender: null, dateOfBirth: null, about: null, contactNumber: null }],
        opts
      )
      const [created] = await User.create(
        [
          {
            firstName,
            lastName,
            email,
            contactNumber,
            password: hashedPassword,
            accountType: accountType,
            approved: approved,
            additionalDetails: profileDetails._id,
            image: "",
          },
        ],
        opts
      )
      await enqueueEvent(
        EVENTS.USER_REGISTERED,
        { userId: String(created._id), email, firstName },
        { session }
      )
      return created
    })

    user.password = undefined

    return res.status(200).json({
      success: true,
      user,
      message: "User registered successfully",
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "User cannot be registered. Please try again.",
    })
  }
}

// Lockout policy for repeated failed login attempts on a single account.
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

// Login controller for authenticating users
// Ends this session server-side: the token's id goes on the revocation list so a
// copy of it (e.g. from a stolen device) stops working immediately.
exports.logout = async (req, res) => {
  await revokeToken(req.user)
  res.clearCookie("token")
  return res.status(200).json({ success: true, message: "Logged out" })
}

exports.login = async (req, res) => {
  try {
    // Get email and password from request body
    const { email, password } = req.body

    // Check if email or password is missing
    if (!email || !password) {
      // Return 400 Bad Request status code with error message
      return res.status(400).json({
        success: false,
        message: `Please Fill up All the Required Fields`,
      })
    }

    // Find user with provided email
    const user = await User.findOne({ email }).populate("additionalDetails")

    // If user not found with provided email
    if (!user) {
      // Return 401 Unauthorized status code with error message
      return res.status(401).json({
        success: false,
        message: `User is not Registered with Us Please SignUp to Continue`,
      })
    }

    // Reject if an admin has deactivated this account
    if (user.active === false) {
      return res.status(403).json({
        success: false,
        message: `Your account has been deactivated. Please contact support.`,
      })
    }

    // Reject if the account is currently locked out from too many failures
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000)
      return res.status(423).json({
        success: false,
        message: `Too many failed login attempts. Please try again in ${minutesLeft} minute(s).`,
      })
    }

    // Generate JWT token and Compare Password
    if (await bcrypt.compare(password, user.password)) {
      // Successful login: clear any prior failed-attempt tracking
      if (user.failedLoginAttempts || user.lockUntil) {
        await User.findByIdAndUpdate(user._id, {
          $set: { failedLoginAttempts: 0 },
          $unset: { lockUntil: "" },
        })
      }

      const token = jwt.sign(
        {
          email: user.email,
          id: user._id,
          role: user.role,
          tokenVersion: user.tokenVersion || 0,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "24h",
          // Unique id so this one session can be revoked on logout.
          jwtid: crypto.randomUUID(),
        }
      )

      // Save token to user document in database
      user.token = token
      user.password = undefined
      // Set cookie for token and return success response
      const options = {
        expires: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        httpOnly: true,
      }
      res.cookie("token", token, options).status(200).json({
        success: true,
        token,
        user,
        message: `User Login Success`,
      })
    } else {
      // Failed attempt: increment counter and lock the account if the
      // threshold is reached.
      const attempts = (user.failedLoginAttempts || 0) + 1
      const update = { failedLoginAttempts: attempts }
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        update.lockUntil = Date.now() + LOCK_DURATION_MS
        update.failedLoginAttempts = 0
      }
      await User.findByIdAndUpdate(user._id, update)

      return res.status(401).json({
        success: false,
        message: `Password is incorrect`,
      })
    }
  } catch (error) {
    console.error(error)
    // Return 500 Internal Server Error status code with error message
    return res.status(500).json({
      success: false,
      message: `Login Failure Please Try Again`,
    })
  }
}
// Send OTP For Email Verification
exports.sendotp = async (req, res) => {
  try {
    const { email } = req.body

    // Check if user is already present
    // Find user with provided email
    const checkUserPresent = await User.findOne({ email })
    // to be used in case of signup

    // If user found with provided email
    if (checkUserPresent) {
      // Return 401 Unauthorized status code with error message
      return res.status(401).json({
        success: false,
        message: `User is Already Registered`,
      })
    }

    // OTPs are only ever looked up per-email, so they don't need to be
    // globally unique. The previous code re-checked uniqueness with a
    // `while (result)` loop that never re-queried — a collision would have
    // spun forever and hung the request.
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0")
    // The OTP row and the event that gets it emailed are written atomically; a
    // worker sends the mail (with retries) after this request has returned.
    await runInTransaction(async (session) => {
      const opts = session ? { session } : {}
      await OTP.create([{ email, otp }], opts)
      await enqueueEvent(EVENTS.OTP_REQUESTED, { email, otp }, { session })
    })
    // Local-development convenience only: lets you finish signup even when
    // no real mail server is configured. Never logged in production.
    if (!["production", "test"].includes(process.env.NODE_ENV)) {
      logger.info({ email, otp }, "DEV ONLY: signup OTP")
    }
    res.status(200).json({
      success: true,
      message: `OTP Sent Successfully`,
    })
  } catch (error) {
    console.log(error.message)
    return res.status(500).json({ success: false, error: error.message })
  }
}

// Controller for Changing Password
exports.changePassword = async (req, res) => {
  try {
    // Get user data from req.user
    const userDetails = await User.findById(req.user.id)

    // Get old password, new password, and confirm new password from req.body
    const { oldPassword, newPassword } = req.body

    // Validate old password
    const isPasswordMatch = await bcrypt.compare(
      oldPassword,
      userDetails.password
    )
    if (!isPasswordMatch) {
      // If old password does not match, return a 401 (Unauthorized) error
      return res
        .status(401)
        .json({ success: false, message: "The password is incorrect" })
    }

    // Update password. Bumping tokenVersion invalidates every token issued
    // before this change (including the one used for this very request) —
    // the frontend logs the user out right after a successful change so this
    // isn't a surprise on their next click.
    const encryptedPassword = await bcrypt.hash(newPassword, 10)
    // The change and the notification event commit together; a worker sends the
    // "password updated" email, so a slow or failing mail server can never be
    // reported to the client as a failed password change.
    await runInTransaction(async (session) => {
      const updatedUserDetails = await User.findByIdAndUpdate(
        req.user.id,
        { password: encryptedPassword, $inc: { tokenVersion: 1 } },
        { new: true, ...(session ? { session } : {}) }
      )
      await enqueueEvent(
        EVENTS.PASSWORD_CHANGED,
        {
          email: updatedUserDetails.email,
          name: `${updatedUserDetails.firstName} ${updatedUserDetails.lastName}`,
        },
        { session }
      )
    })

    // Return success response
    return res
      .status(200)
      .json({ success: true, message: "Password updated successfully" })
  } catch (error) {
    // If there's an error updating the password, log the error and return a 500 (Internal Server Error) error
    console.error("Error occurred while updating password:", error)
    return res.status(500).json({
      success: false,
      message: "Error occurred while updating password",
      error: error.message,
    })
  }
}
