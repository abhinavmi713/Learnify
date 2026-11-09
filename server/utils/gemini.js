
// Kept in one place so a model rename (Google retires these periodically)
// only needs to change here instead of in every AI-assist route.
const MODEL = "gemini-3.6-flash"

// Calls Gemini with a single text prompt and returns the reply text.
// Throws on any failure — callers decide how to surface that to the client.
async function callGemini(prompt, { temperature = 0.7, maxOutputTokens = 1536 } = {}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured")
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      // In a header, not the URL, where proxies and monitoring often log it.
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, topK: 40, topP: 0.95, maxOutputTokens },
      }),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    const err = new Error(data?.error?.message || "Gemini API error")
    err.detail = data
    throw err
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    const err = new Error("Gemini returned no content")
    err.detail = data
    throw err
  }
  return text
}

// Pulls a JSON value out of a model response that may be wrapped in a
// ```json ... ``` fence or preceded/followed by stray prose.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.search(/[[{]/)
  if (start === -1) throw new Error("No JSON found in model response")
  return JSON.parse(raw.slice(start))
}

module.exports = { callGemini, extractJson }
