// Idempotency-Key for a user action, derived from what is being submitted, so a
// double click, a retry after a timeout, or the same checkout in two tabs all
// send the same key and the server performs the action once. Changing the
// content (another course, another coupon) gives a new key. Keys roll over every
// 10 minutes so a genuinely new attempt later is not answered from the cache.
function fnv1a(str, seed) {
  let h = seed >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function idempotencyKey(action, ...parts) {
  const text = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join("|")
  const window = Math.floor(Date.now() / (10 * 60 * 1000))
  return `${action}-${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x01000193)}-${window}`
}
