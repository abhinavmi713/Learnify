const { escapeHtml } = require("../../utils/escapeHtml")

// Small transactional emails. Every interpolated value is escaped because some
// of them (names, course titles) are user-controlled.
const wrap = (title, body) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family: Arial, sans-serif; color:#222; max-width:560px; margin:0 auto; padding:24px; line-height:1.5;">
  <h2 style="margin:0 0 16px;">${escapeHtml(title)}</h2>
  ${body}
  <p style="color:#888; font-size:12px; margin-top:32px;">Learnify</p>
</body>
</html>`

exports.welcomeEmail = (name) =>
  wrap("Welcome to Learnify", `<p>Hi ${escapeHtml(name)}, your account is ready. Browse the catalog and start your first course whenever you like.</p>`)

exports.certificateEarnedEmail = (name, courseName) =>
  wrap(
    "You earned a certificate",
    `<p>Congratulations ${escapeHtml(name)}! You completed <strong>${escapeHtml(courseName)}</strong>. Your certificate is available in your dashboard under Certificates.</p>`
  )

exports.refundEmail = (name, amount) =>
  wrap(
    "Your payment is being refunded",
    `<p>Hi ${escapeHtml(name)}, we could not complete your enrollment after your payment, so we have started a refund of ₹${escapeHtml(amount)}. It usually reaches your account in 5-7 business days.</p>`
  )

exports.passwordResetEmail = (url) =>
  wrap(
    "Reset your password",
    `<p>Use this link to choose a new password. It is valid for 15 minutes:</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>If you did not request this, you can ignore this email.</p>`
  )
