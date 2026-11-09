// Renders the small subset of Markdown the assistant uses (paragraphs, bullet
// and numbered lists, **bold**, *italic*, `code` and ``` fenced blocks) as React
// elements. Text is never inserted as HTML, so a message can't inject markup.
function inline(text, keyPrefix) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(part)) return <code key={key} className="rounded bg-richblack-700 px-1 text-[12px]">{part.slice(1, -1)}</code>
    if (/^\*[^*\s][^*]*\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>
    return part
  })
}

export default function ChatMarkdown({ text }) {
  const blocks = []
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().startsWith("```")) {
      const code = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++])
      i++
      blocks.push(<pre key={`b${blocks.length}`} className="my-1 overflow-x-auto rounded bg-richblack-900 p-2 text-[12px]"><code>{code.join("\n")}</code></pre>)
      continue
    }
    const bullet = /^\s*[-*•]\s+/
    const numbered = /^\s*\d+[.)]\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const items = []
      while (i < lines.length && (ordered ? numbered : bullet).test(lines[i])) {
        items.push(lines[i].replace(ordered ? numbered : bullet, ""))
        i++
      }
      const Tag = ordered ? "ol" : "ul"
      blocks.push(
        <Tag key={`b${blocks.length}`} className={`my-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((item, j) => <li key={j}>{inline(item, `l${blocks.length}-${j}`)}</li>)}
        </Tag>
      )
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !numbered.test(lines[i]) && !lines[i].trim().startsWith("```")) {
      para.push(lines[i++])
    }
    blocks.push(<p key={`b${blocks.length}`} className="my-1">{inline(para.join(" ").replace(/^#{1,6}\s+/, ""), `p${blocks.length}`)}</p>)
  }
  return <>{blocks}</>
}
