const crypto = require("crypto")
const dns = require("dns").promises
const net = require("net")
const Webhook = require("../models/Webhook")
const WebhookDelivery = require("../models/WebhookDelivery")
const secretBox = require("./secretBox")
const { webhookDeliveries } = require("./metrics")

// Outbound webhooks for instructors.
//
// Contract (what receivers rely on):
//   POST <url>   Content-Type: application/json
//   Learnify-Event:      enrollment.created | review.created | course.published | course.rejected | ping
//   Learnify-Delivery:   unique id; the same id on a retry, so receivers can de-duplicate
//   Learnify-Signature:  t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
// Receivers verify the HMAC with a constant-time compare and reject timestamps
// older than ~5 minutes (replay protection). Any 2xx is success; anything else,
// a timeout or a network error is retried with backoff, then the delivery fails.
const WEBHOOK_EVENTS = ["enrollment.created", "review.created", "course.published", "course.rejected"]
const TIMEOUT_MS = 5000
const DISABLE_AFTER_FAILURES = 15

const newSecret = () => `whsec_${crypto.randomBytes(24).toString("base64url")}`

function sign(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  return `t=${timestamp},v1=${v1}`
}

// Reference verification, the same code a receiver would run (used in tests).
function verifySignature(secret, body, header, { toleranceSec = 300, now = Date.now() } = {}) {
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")))
  const t = Number(parts.t)
  if (!t || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSec) return false
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")
  return expected.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}

// --- SSRF protection -------------------------------------------------------
// A webhook URL makes OUR server send requests, so it must never reach our own
// network: loopback, private ranges, link-local (cloud metadata at
// 169.254.169.254), and so on. Checked when saved AND before every delivery
// (the DNS answer can change after saving: "DNS rebinding").
const allowPrivate = () => process.env.ALLOW_PRIVATE_WEBHOOK_URLS === "1" && process.env.NODE_ENV !== "production"

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  const v6 = ip.toLowerCase()
  if (v6 === "::1" || v6 === "::") return true
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7))
  return v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")
}

class WebhookUrlError extends Error {}

async function assertDeliverableUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch (error) {
    throw new WebhookUrlError("Enter a valid URL")
  }
  if (url.username || url.password) throw new WebhookUrlError("URLs with credentials are not allowed")
  const httpsRequired = process.env.NODE_ENV === "production"
  if (!(url.protocol === "https:" || (!httpsRequired && url.protocol === "http:"))) {
    throw new WebhookUrlError(httpsRequired ? "Webhook URLs must use https" : "Use an http or https URL")
  }
  if (allowPrivate()) return url
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address)
  if (!addresses.length) throw new WebhookUrlError("That host name does not resolve")
  if (addresses.some(isPrivateAddress)) throw new WebhookUrlError("Webhook URLs cannot point to private or internal addresses")
  return url
}

// --- delivery ----------------------------------------------------------------

// Sends one delivery. Throws on failure so the queue retries it.
async function deliver(deliveryId, { finalAttempt = false } = {}) {
  const delivery = await WebhookDelivery.findById(deliveryId)
  if (!delivery || delivery.status === "succeeded") return { skipped: true }
  const hook = await Webhook.findById(delivery.webhook).select("+secret")
  if (!hook || !hook.active) {
    await WebhookDelivery.updateOne({ _id: delivery._id }, { status: "failed", error: "webhook removed or paused" })
    return { skipped: true }
  }

  const body = JSON.stringify({ id: String(delivery._id), event: delivery.event, createdAt: delivery.createdAt, data: delivery.payload })
  const started = Date.now()
  let result
  try {
    await assertDeliverableUrl(hook.url)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        redirect: "manual", // a redirect could point somewhere internal
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Learnify-Webhooks/1.0",
          "Learnify-Event": delivery.event,
          "Learnify-Delivery": String(delivery._id),
          "Learnify-Signature": sign(secretBox.open(hook.secret), body),
        },
        body,
      })
      const text = (await res.text().catch(() => "")).slice(0, 500)
      result = { ok: res.status >= 200 && res.status < 300, responseStatus: res.status, responseBody: text, error: null }
      if (!result.ok) result.error = `HTTP ${res.status}`
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    result = { ok: false, responseStatus: null, responseBody: "", error: error.name === "AbortError" ? `timed out after ${TIMEOUT_MS} ms` : error.message }
  }

  const durationMs = Date.now() - started
  const permanent = result.ok || finalAttempt || result.error?.startsWith("Webhook URLs")
  await WebhookDelivery.updateOne(
    { _id: delivery._id },
    {
      $inc: { attempts: 1 },
      $set: {
        status: result.ok ? "succeeded" : permanent ? "failed" : "pending",
        responseStatus: result.responseStatus,
        responseBody: result.responseBody,
        error: result.error,
        durationMs,
        ...(result.ok ? { deliveredAt: new Date() } : {}),
      },
    }
  )
  webhookDeliveries.inc({ outcome: result.ok ? "success" : "failure" })

  if (result.ok) {
    await Webhook.updateOne({ _id: hook._id }, { $set: { consecutiveFailures: 0, lastDeliveryAt: new Date() } })
    return { ok: true }
  }
  const updated = await Webhook.findOneAndUpdate({ _id: hook._id }, { $inc: { consecutiveFailures: 1 } }, { new: true })
  if (updated.consecutiveFailures >= DISABLE_AFTER_FAILURES && updated.active) {
    await Webhook.updateOne(
      { _id: hook._id },
      { $set: { active: false, disabledReason: `Paused after ${DISABLE_AFTER_FAILURES} failed deliveries in a row` } }
    )
    const { notifyUser } = require("./notify")
    await notifyUser(hook.owner, `A webhook to ${new URL(hook.url).host} was paused after repeated failures.`, "/dashboard/webhooks").catch(() => {})
  }
  if (permanent) return { ok: false, error: result.error }
  throw new Error(`webhook delivery failed: ${result.error}`)
}

module.exports = {
  WEBHOOK_EVENTS,
  newSecret,
  sign,
  verifySignature,
  isPrivateAddress,
  assertDeliverableUrl,
  WebhookUrlError,
  deliver,
}
