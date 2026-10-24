// Mail templates build HTML by interpolating values straight into template
// literals. Some of those values (a signup name, a course title, a contact-
// form message) are attacker-controlled and were being interpolated
// unescaped — this is what stands between that and an HTML/markup injection
// inside an email sent to someone else.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return char
    }
  })
}

module.exports = { escapeHtml }
