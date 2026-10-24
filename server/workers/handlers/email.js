const User = require("../../models/User")
const Course = require("../../models/Course")
const mailSender = require("../../utils/mailSender")
const logger = require("../../utils/logger")
const { withBreaker } = require("../../utils/resilience")
const { EVENTS } = require("../../events/types")
const emailVerificationTemplate = require("../../mail/templates/emailVerificationTemplate")
const { courseEnrollmentEmail } = require("../../mail/templates/courseEnrollmentEmail")
const { contactUsEmail } = require("../../mail/templates/contactFormRes")
const { passwordUpdated } = require("../../mail/templates/passwordUpdate")
const { welcomeEmail, certificateEarnedEmail, passwordResetEmail } = require("../../mail/templates/simpleEmails")

// SMTP is a third party that can be slow or down. Behind a breaker, a dead mail
// server makes sends fail fast (and get retried later by the queue) instead of
// every worker slot waiting out a timeout.
const send = withBreaker("smtp", (to, subject, html) => mailSender(to, subject, html), {
  timeout: 15000,
  volumeThreshold: 10,
})

// Local development has no SMTP server; skip quietly (OTPs and reset links are
// printed to the log in development) instead of failing every job into the DLQ.
const mailConfigured = () => Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS)
const skipMail = () => process.env.NODE_ENV === "development" && !mailConfigured()

const templates = {
  [EVENTS.OTP_REQUESTED]: async ({ email, otp }) => [email, "Verification Email", emailVerificationTemplate(otp)],

  [EVENTS.PASSWORD_RESET_REQUESTED]: async ({ email, url }) => [email, "Password Reset", passwordResetEmail(url)],

  [EVENTS.PASSWORD_CHANGED]: async ({ email, name }) => [
    email,
    "Password for your account has been updated",
    passwordUpdated(email, `Password updated successfully for ${name}`),
  ],

  [EVENTS.USER_REGISTERED]: async ({ email, firstName }) => [email, "Welcome to Learnify", welcomeEmail(firstName)],

  [EVENTS.CONTACT_SUBMITTED]: async ({ email, firstname, lastname, message, phoneNo, countrycode }) => [
    email,
    "Your Data send successfully",
    contactUsEmail(email, firstname, lastname, message, phoneNo, countrycode),
  ],
}

// One enrollment email per newly enrolled course.
async function sendOrderPaid({ userId, courseIds }) {
  const user = await User.findById(userId)
  if (!user) return
  const courses = await Course.find({ _id: { $in: courseIds } }).select("courseName")
  for (const course of courses) {
    await send(
      user.email,
      `Successfully Enrolled into ${course.courseName}`,
      courseEnrollmentEmail(course.courseName, `${user.firstName} ${user.lastName}`)
    )
  }
}

async function sendCertificateEarned({ userId, courseId }) {
  const [user, course] = await Promise.all([User.findById(userId), Course.findById(courseId).select("courseName")])
  if (!user || !course) return
  await send(user.email, "You earned a certificate", certificateEarnedEmail(user.firstName, course.courseName))
}

// Single entry point for the `email` queue. Throwing makes the broker retry.
async function handleEmailEvent(event) {
  if (skipMail()) {
    logger.info({ type: event.type }, "mail not configured in development; email skipped")
    return
  }
  if (event.type === EVENTS.ORDER_PAID) return sendOrderPaid(event.payload)
  if (event.type === EVENTS.COURSE_COMPLETED) return sendCertificateEarned(event.payload)

  const build = templates[event.type]
  if (!build) {
    logger.warn({ type: event.type }, "email consumer received an event it has no template for")
    return
  }
  const [to, subject, html] = await build(event.payload)
  await send(to, subject, html)
}

module.exports = { handleEmailEvent }
