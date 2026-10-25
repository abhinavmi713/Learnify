// Domain events published through the outbox. Names are past-tense facts
// ("something happened"), not commands, so any number of consumers can react.
const EVENTS = {
  USER_REGISTERED: "user.registered",
  OTP_REQUESTED: "otp.requested",
  PASSWORD_RESET_REQUESTED: "password.reset_requested",
  PASSWORD_CHANGED: "password.changed",
  ORDER_PAID: "order.paid",
  COURSE_COMPLETED: "course.completed",
  COURSE_CONTENT_CHANGED: "course.content_changed",
  CONTACT_SUBMITTED: "contact.submitted",
  PAYMENT_REFUND_REQUESTED: "payment.refund_requested",
}

// Events whose payload contains a secret (an OTP, a reset link). The outbox wipes
// their payload as soon as they are delivered.
const SENSITIVE = new Set([EVENTS.OTP_REQUESTED, EVENTS.PASSWORD_RESET_REQUESTED])

module.exports = { EVENTS, SENSITIVE }
