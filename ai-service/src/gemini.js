// Thin Gemini client: embeddings (batched) and text generation.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models"

async function postJson(url, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Gemini HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

function createGemini({ apiKey, embedModel, embedDim, genModel }) {
  // taskType matters: documents and queries are embedded differently so that a
  // short question lands near the passage that answers it.
  async function embed(texts, taskType = "RETRIEVAL_DOCUMENT") {
    const out = []
    // The batch endpoint accepts up to 100 inputs per call.
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100)
      const data = await postJson(
        `${BASE}/${embedModel}:batchEmbedContents?key=${apiKey}`,
        {
          requests: batch.map((text) => ({
            model: `models/${embedModel}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: embedDim,
          })),
        },
        30000
      )
      out.push(...data.embeddings.map((e) => e.values))
    }
    return out
  }

  async function generate(prompt, { temperature = 0.2, maxOutputTokens = 800 } = {}) {
    const data = await postJson(
      `${BASE}/${genModel}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens },
      },
      30000
    )
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("")
    if (!text) throw new Error("Gemini returned no text")
    return text.trim()
  }

  return { embed, generate }
}

module.exports = { createGemini }
