process.env.NODE_ENV = "test"
const request = require("supertest")
const { buildChunks, splitIntoWindows, stableId, MAX_CHARS } = require("../src/chunker")
const { createRag, buildPrompt, extractCitations, renumber, NOT_COVERED } = require("../src/rag")
const { createIndexer } = require("../src/indexer")
const { createApp } = require("../src/app")
const { loadConfig } = require("../src/config")

const course = {
  courseId: "6adc46a409f1ec39656992a3",
  courseName: "JavaScript Fundamentals",
  courseDescription: "Variables, functions and the DOM.",
  whatYouWillLearn: "Write modern JavaScript",
  searchable: true,
  sections: [
    {
      sectionId: "s1",
      sectionName: "Core language",
      lectures: [
        { subSectionId: "l1", title: "Functions and scope", description: "let and const are block-scoped.", transcript: "" },
        { subSectionId: "l2", title: "Arrays", description: "map returns a new array.", transcript: "x".repeat(3000) },
      ],
    },
  ],
}

describe("chunker", () => {
  test("one overview chunk plus lecture chunks, each carrying its location", () => {
    const chunks = buildChunks(course)
    expect(chunks[0].payload.kind).toBe("overview")
    const fn = chunks.find((c) => c.payload.subSectionId === "l1")
    expect(fn.text).toMatch(/Section: Core language > Lecture: Functions and scope/)
    expect(fn.payload).toMatchObject({ courseId: course.courseId, sectionId: "s1", title: "Functions and scope" })
  })

  test("long lectures are split into overlapping windows no longer than the limit", () => {
    const text = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} explains something useful.`).join(" ")
    const windows = splitIntoWindows(text)
    expect(windows.length).toBeGreaterThan(1)
    windows.forEach((w) => expect(w.length).toBeLessThanOrEqual(MAX_CHARS))
    // consecutive windows share text (overlap), so an answer spanning a cut is not lost
    const tail = windows[0].slice(-60)
    expect(windows[1]).toContain(tail.slice(-30))
  })

  test("ids are stable UUIDs, so re-indexing overwrites instead of duplicating", () => {
    expect(stableId("a")).toBe(stableId("a"))
    expect(stableId("a")).not.toBe(stableId("b"))
    expect(stableId("a")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(buildChunks(course).map((c) => c.id)).toEqual(buildChunks(course).map((c) => c.id))
  })
})

const hit = (score, payload) => ({ score, payload: { courseName: course.courseName, kind: "lecture", ...payload } })

describe("rag", () => {
  test("prompt numbers the excerpts and states the rules", () => {
    const prompt = buildPrompt({ courseName: "JS", question: "What is scope?", hits: [hit(0.8, { title: "Functions", sectionName: "Core", text: "TEXT-A" })] })
    expect(prompt).toMatch(/\[1\] \(lecture "Functions", section "Core"\)\nTEXT-A/)
    expect(prompt).toContain(NOT_COVERED)
    expect(prompt).toMatch(/Question: What is scope\?$/)
  })

  test("citations map back to unique lectures in order of use; bad numbers are ignored", () => {
    const hits = [
      hit(0.81, { title: "Functions", subSectionId: "l1", sectionId: "s1" }),
      hit(0.74, { title: "Arrays", subSectionId: "l2", sectionId: "s1" }),
      hit(0.7, { title: "Functions", subSectionId: "l1", sectionId: "s1" }),
    ]
    const c = extractCitations("Blocks scope let [3]. Map copies [2][1]. Bogus [9].", hits)
    expect(c.map((x) => x.subSectionId)).toEqual(["l1", "l2"])
    // text markers follow the citations list: excerpt 3 and 1 are both lecture l1 -> [1]
    expect(renumber("Blocks scope let [3]. Map copies [2][1]. Bogus [9].", hits, c)).toBe("Blocks scope let [1]. Map copies [2][1]. Bogus .")
    // two excerpts from the same lecture collapse into one marker
    expect(renumber("Scope [1][3].", hits, c)).toBe("Scope [1].")
  })

  test("answer() embeds the question as a query, searches only this course, and reports grounding", async () => {
    const calls = {}
    const gemini = {
      embed: async (texts, type) => ((calls.embed = { texts, type }), [[0.1, 0.2]]),
      generate: async (prompt) => ((calls.prompt = prompt), "let is block-scoped [1]."),
    }
    const qdrant = { search: async (v, opts) => ((calls.search = opts), [hit(0.8, { title: "Functions", subSectionId: "l1", sectionId: "s1", text: "let..." })]) }
    const rag = createRag({ gemini, qdrant, topK: 5, minScore: 0.6 })
    const out = await rag.answer({ courseId: course.courseId, question: "What is let?" })
    expect(calls.embed.type).toBe("RETRIEVAL_QUERY")
    expect(calls.search).toEqual({ courseId: course.courseId, limit: 5, scoreThreshold: 0.6 })
    expect(out.grounded).toBe(true)
    expect(out.citations[0].title).toBe("Functions")
  })

  test("with nothing relevant retrieved, the answer is marked as not grounded", async () => {
    const gemini = { embed: async () => [[0]], generate: async () => `${NOT_COVERED} In general, ...` }
    const rag = createRag({ gemini, qdrant: { search: async () => [] }, topK: 5, minScore: 0.6 })
    const out = await rag.answer({ courseId: course.courseId, question: "Who won the 1998 world cup?" })
    expect(out.grounded).toBe(false)
    expect(out.citations).toEqual([])
  })
})

describe("indexer", () => {
  function fakes(content) {
    const log = []
    const qdrant = {
      deleteCourse: async (id) => log.push(["delete", id]),
      upsert: async (points) => log.push(["upsert", points.length, points[0]?.payload.text]),
    }
    const gemini = { embed: async (texts) => texts.map(() => [0.1, 0.2]) }
    return { log, indexer: createIndexer({ fetchCourse: async () => content, gemini, qdrant }) }
  }

  test("a published course is rebuilt: old points deleted, new ones upserted with their text", async () => {
    const { log, indexer } = fakes(course)
    const r = await indexer.indexCourse(course.courseId)
    expect(r.removed).toBe(false)
    expect(log[0]).toEqual(["delete", course.courseId])
    expect(log[1][0]).toBe("upsert")
    expect(log[1][1]).toBe(r.indexed)
    expect(log[1][2]).toMatch(/Course: JavaScript Fundamentals/)
  })

  test("a course that is no longer searchable (or gone) is removed from the index", async () => {
    for (const content of [{ ...course, searchable: false }, null]) {
      const { log, indexer } = fakes(content)
      expect((await indexer.indexCourse(course.courseId)).removed).toBe(true)
      expect(log).toEqual([["delete", course.courseId]])
    }
  })
})

describe("http api", () => {
  const token = "t".repeat(32)
  const rag = { answer: async ({ question }) => ({ answer: `echo ${question}`, grounded: false, citations: [], retrieved: 0, timingsMs: { total: 1 } }) }
  const app = createApp({ token, rag, indexer: { indexCourse: async (id) => ({ courseId: id, indexed: 3 }) }, health: async () => ({ ok: true }) })

  test("health is open; everything else needs the internal token", async () => {
    expect((await request(app).get("/health")).status).toBe(200)
    expect((await request(app).post("/v1/ask").send({})).status).toBe(401)
    expect((await request(app).post("/v1/ask").set("X-Internal-Token", "wrong").send({})).status).toBe(401)
  })

  test("validates input and answers", async () => {
    const bad = await request(app).post("/v1/ask").set("X-Internal-Token", token).send({ courseId: "x", question: "hi there" })
    expect(bad.status).toBe(400)
    const ok = await request(app).post("/v1/ask").set("X-Internal-Token", token).send({ courseId: course.courseId, question: "what is scope" })
    expect(ok.status).toBe(200)
    expect(ok.body.data.answer).toBe("echo what is scope")
  })
})

describe("config", () => {
  test("refuses to start without a strong internal token or an API key", () => {
    expect(() => loadConfig({ INTERNAL_API_TOKEN: "short", GEMINI_API_KEY: "" })).toThrow(/INTERNAL_API_TOKEN|GEMINI_API_KEY/)
    const ok = loadConfig({ INTERNAL_API_TOKEN: "x".repeat(32), GEMINI_API_KEY: "k".repeat(20) })
    expect(ok.PORT).toBe(5001)
    expect(ok.MIN_SCORE).toBe(0.6)
  })
})
