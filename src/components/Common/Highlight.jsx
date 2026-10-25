// Renders search-engine highlight markup ("<mark>Java</mark>Script") as text
// with <mark> elements. The string is split on the tags and every piece is
// rendered as a plain text node, so a course name can never inject HTML.
export default function Highlight({ text, fallback = "" }) {
  if (!text) return fallback
  const parts = String(text).split(/(<mark>|<\/mark>)/)
  let marked = false
  return parts.map((part, i) => {
    if (part === "<mark>") {
      marked = true
      return null
    }
    if (part === "</mark>") {
      marked = false
      return null
    }
    if (!part) return null
    return marked ? (
      <mark key={i} className="rounded bg-yellow-50/30 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  })
}
