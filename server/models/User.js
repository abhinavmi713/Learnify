// Import the Mongoose library
const mongoose = require("mongoose")

// Define the user schema using the Mongoose Schema constructor
const userSchema = new mongoose.Schema(
  {
    // Define the name field with type String, required, and trimmed
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    // Define the email field with type String, required, and trimmed
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    // Define the password field with type String and required
    password: {
      type: String,
      required: true,
    },
    // Define the role field with type String and enum values of "Admin", "Student", or "Visitor"
    accountType: {
      type: String,
      enum: ["Admin", "Student", "Instructor"],
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    // Bumped whenever the password changes (self-service change or reset).
    // Every JWT carries the tokenVersion it was issued under, so changing
    // your password immediately invalidates every other token out there —
    // without this, a stolen token stayed valid until it naturally expired
    // even after the account owner changed their password.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    approved: {
      type: Boolean,
      default: true,
    },
    additionalDetails: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Profile",
    },
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    token: {
      type: String,
    },
    // Hashed (never plaintext) single-use token used for the forgot-password flow.
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
    image: {
      type: String,
    },
    courseProgress: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "courseProgress",
      },
    ],
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    // Soft-delete marker set by the self-service "delete my account" flow —
    // paired with `active: false` (already checked by the auth middleware)
    // so a deleted account is immediately locked out without destroying its
    // data. `null` means not deleted.
    deletedAt: {
      type: Date,
      default: null,
    },
    // The real address of a soft-deleted account. `email` is rewritten to a
    // unique placeholder on deletion so the unique index doesn't permanently
    // block that person from signing up again.
    originalEmail: {
      type: String,
    },

    // Add timestamps for when the document is created and last modified
  },
  { timestamps: true }
)

// Export the Mongoose model for the user schema, using the name "user"
module.exports = mongoose.model("user", userSchema)
