// Retrieval-augmented answering for one course.
//
// 1. Embed the question (as a query, not a document).
// 2. Fetch the nearest chunks of THIS course above a similarity threshold.
// 3. Ask the model to answer only from those numbered excerpts and cite them.
// 4. Map the citation numbers it used back to lectures the UI can link to.
//
// If nothing relevant is retrieved, the model is told so and must say the topic
// is not covered before giving a brief general answer: it never pretends a
// general answer came from the course.
const NOT_COVERED = "This isn't covered in the course material."

function buildPrompt({ courseName, question, hits }) {
  const excerpts = hits.length
    ? hits
        .map((h, i) => {
          const where = h.payload.kind === "overview" ? "course overview" : `lecture "${h.payload.title}", section "${h.payload.sectionName}"`
          return `[${i + 1}] (${where})\n${h.payload.text}`
        })
        .join("\n\n")
    : "(no relevant excerpts were found)"

  return [
    `You are the study assistant for the course "${courseName}" on Learnify.`,
    "Answer the student's question using the numbered course excerpts below when they are relevant.",
    "Cite every excerpt you rely on with its number in square brackets, for example [1] or [2][3].",
    `If the excerpts do not contain the answer, start with "${NOT_COVERED}" and then give a short general answer without citations.`,
    "Be concise (at most 6 sentences). Do not greet the student or introduce yourself.",
    "",
    "Excerpts:",
    excerpts,
    "",
    `Question: ${question}`,
  ].join("\n")
}

// Rewrites the model's excerpt numbers ([3], [1]) to the position of the cited
// lecture in the returned citations list, so "[1]" in the text is the first
// source the UI shows. Unknown numbers are dropped.
function renumber(answer, hits, citations) {
  const position = new Map(citations.map((c, i) => [c.subSectionId || "overview", i + 1]))
  return answer
    .replace(/\[(\d+)\]/g, (_, n) => {
      const hit = hits[Number(n) - 1]
      const pos = hit && position.get(hit.payload.subSectionId || "overview")
      return pos ? `[${pos}]` : ""
    })
    .replace(/(\[\d+\])(?:\1)+/g, "$1") // "[1][1]" -> "[1]"
}

// Citation numbers the model actually used -> unique lectures (in order of use).
function extractCitations(answer, hits) {
  const used = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]) - 1)
  const seen = new Set()
  const citations = []
  for (const idx of used) {
    const hit = hits[idx]
    if (!hit) continue
    const key = hit.payload.subSectionId || "overview"
    if (seen.has(key)) continue
    seen.add(key)
    citations.push({
      title: hit.payload.title,
      kind: hit.payload.kind,
      sectionId: hit.payload.sectionId || null,
      subSectionId: hit.payload.subSectionId || null,
      score: Number(hit.score.toFixed(3)),
    })
  }
  return citations
}

function createRag({ gemini, qdrant, topK, minScore }) {
  async function answer({ courseId, courseName, question }) {
    const t0 = Date.now()
    const [vector] = await gemini.embed([question], "RETRIEVAL_QUERY")
    const t1 = Date.now()
    const hits = await qdrant.search(vector, { courseId, limit: topK, scoreThreshold: minScore })
    const t2 = Date.now()
    const name = courseName || hits[0]?.payload.courseName || "this course"
    const text = await gemini.generate(buildPrompt({ courseName: name, question, hits }))
    const t3 = Date.now()

    const citations = extractCitations(text, hits)
    const grounded = citations.length > 0 && !text.startsWith(NOT_COVERED)
    return {
      answer: renumber(text, hits, citations),
      grounded,
      citations,
      retrieved: hits.length,
      timingsMs: { embed: t1 - t0, search: t2 - t1, generate: t3 - t2, total: t3 - t0 },
    }
  }

  return { answer }
}

module.exports = { createRag, buildPrompt, extractCitations, renumber, NOT_COVERED }
