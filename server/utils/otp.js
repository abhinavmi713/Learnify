const crypto = require("crypto")

// Six digits are guessable, so a plain hash could be reversed from a leaked
// database. Keying it with a server secret prevents that.
const hashOtp = (email, otp) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${email}:${otp}`).digest("hex")

function otpMatches(email, otp, stored) {
  const given = Buffer.from(hashOtp(email, String(otp)))
  const expected = Buffer.from(String(stored))
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

module.exports = { hashOtp, otpMatches }
