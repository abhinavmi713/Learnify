const mongoose = require("mongoose");
const OTPSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
	},
	otp: {
		type: String,
		required: true,
	},
	createdAt: {
		type: Date,
		default: Date.now,
		expires: 60 * 5, // The document will be automatically deleted after 5 minutes of its creation time
	},
});

// The verification email is no longer sent from a save hook. sendotp writes an
// "otp.requested" outbox event in the same transaction as this document, and a
// worker sends the mail with retries (see events/ and workers/).

const OTP = mongoose.model("OTP", OTPSchema);

module.exports = OTP;
