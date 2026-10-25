const crypto = require("crypto")

// Turns one course into retrieval chunks.
//
// Granularity: one "overview" chunk for the course, then the text of each
// lecture (title + description + transcript). Long lectures are split into
// windows of ~MAX_CHARS with OVERLAP characters carried over, cut at sentence
// boundaries, so an answer that spans a cut is still found in one window.
// Every chunk carries its location (section, lecture) so answers can cite it.
const MAX_CHARS = 1200
const OVERLAP = 200

// Qdrant point ids must be UUIDs or integers; derive a stable UUID from the
// chunk's identity so re-indexing the same content overwrites the same points.
function stableId(key) {
  const h = crypto.createHash("sha1").update(key).digest("hex")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function splitIntoWindows(text, max = MAX_CHARS, overlap = OVERLAP) {
  const clean = String(text || "").replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean ? [clean] : []
  const sentences = clean.match(/[^.!?]+[.!?]*\s*/g) || [clean]
  const windows = []
  let current = ""
  for (const sentence of sentences) {
    if ((current + sentence).length > max && current) {
      windows.push(current.trim())
      current = current.slice(Math.max(0, current.length - overlap)) // carry the tail over
    }
    current += sentence
    // A single sentence longer than the window is hard-split.
    while (current.length > max) {
      windows.push(current.slice(0, max).trim())
      current = current.slice(max - overlap)
    }
  }
  if (current.trim()) windows.push(current.trim())
  return windows
}

function buildChunks(course) {
  const base = { courseId: course.courseId, courseName: course.courseName }
  const chunks = []

  const overview = [
    `Course: ${course.courseName}`,
    course.courseDescription && `About the course: ${course.courseDescription}`,
    course.whatYouWillLearn && `What you will learn: ${course.whatYouWillLearn}`,
    `Sections: ${(course.sections || []).map((s) => s.sectionName).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n")
  chunks.push({ id: stableId(`${course.courseId}:overview`), text: overview, payload: { ...base, kind: "overview", title: "Course overview" } })

  for (const section of course.sections || []) {
    for (const lecture of section.lectures || []) {
      const body = [lecture.description, lecture.transcript].filter(Boolean).join("\n")
      const windows = splitIntoWindows(body)
      const parts = windows.length ? windows : [""]
      parts.forEach((window, i) => {
        const header = `Course: ${course.courseName} > Section: ${section.sectionName} > Lecture: ${lecture.title}`
        chunks.push({
          id: stableId(`${course.courseId}:${lecture.subSectionId}:${i}`),
          text: `${header}\n${window}`.trim(),
          payload: {
            ...base,
            kind: "lecture",
            sectionId: section.sectionId,
            sectionName: section.sectionName,
            subSectionId: lecture.subSectionId,
            title: lecture.title,
            part: i,
          },
        })
      })
    }
  }
  return chunks
}

module.exports = { buildChunks, splitIntoWindows, stableId, MAX_CHARS, OVERLAP }
