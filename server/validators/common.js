const { z } = require("zod")

// A 24-char hex Mongo ObjectId, as a string.
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id")

// Multipart (FormData) fields arrive as strings, so arrays/numbers are checked
// *as strings* and deliberately NOT transformed — the controllers for those
// routes still do their own JSON.parse / Number conversion.
const jsonStringArray = (label) =>
  z.string().refine(
    (value) => {
      try {
        const parsed = JSON.parse(value)
        return (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((item) => typeof item === "string" && item.trim())
        )
      } catch {
        return false
      }
    },
    { message: `${label} must be a non-empty list` }
  )

// A non-negative number sent either as a JSON number or a FormData string.
const nonNegativeNumberLike = z
  .union([z.string(), z.number()])
  .refine((value) => /^\d+(\.\d+)?$/.test(String(value).trim()), {
    message: "must be a non-negative number",
  })

module.exports = { objectId, jsonStringArray, nonNegativeNumberLike }
