const nodemailer = require("nodemailer")
const logger = require("./logger")

// Works with any SMTP provider (Gmail, Amazon SES, Resend, Postmark, Mailgun…):
// only configuration changes, never code.
//   MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS  — SMTP credentials
//   MAIL_SECURE=true                            — implicit TLS (port 465)
//   MAIL_FROM="Learnify <no-reply@yourdomain>"  — sender (defaults to MAIL_USER)
let transporter
function getTransporter() {
  if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
    throw new Error("Mail is not configured (set MAIL_HOST, MAIL_USER and MAIL_PASS)")
  }
  if (!transporter) {
    const port = Number(process.env.MAIL_PORT) || 587
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      secure: process.env.MAIL_SECURE === "true" || port === 465,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    })
  }
  return transporter
}

// Resolves with nodemailer's info object, or REJECTS on failure. It used to
// swallow every error and return the error message as a string, which made
// "the email never sent" indistinguishable from success for every caller.
const mailSender = async (email, title, body) => {
  try {
    const info = await getTransporter().sendMail({
      from: process.env.MAIL_FROM || `"Learnify" <${process.env.MAIL_USER}>`,
      to: email,
      subject: title,
      html: body,
    })
    logger.info({ to: email, subject: title }, "email sent")
    return info
  } catch (error) {
    logger.error({ to: email, subject: title, err: error.message }, "email failed")
    throw error
  }
}

module.exports = mailSender
