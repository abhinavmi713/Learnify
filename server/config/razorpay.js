const Razorpay = require("razorpay")

// Built lazily: constructing the client throws when the keys are missing,
// which used to crash the whole server (and CI) at require-time even though
// only the payment routes ever need it.
let instance
exports.getInstance = () => {
  if (!instance) {
    if (!process.env.RAZORPAY_KEY || !process.env.RAZORPAY_SECRET) {
      throw new Error("Razorpay is not configured (set RAZORPAY_KEY and RAZORPAY_SECRET)")
    }
    instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY,
      key_secret: process.env.RAZORPAY_SECRET,
    })
  }
  return instance
}
