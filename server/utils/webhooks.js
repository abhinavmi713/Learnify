const crypto = require("crypto")
const dns = require("dns").promises
const net = require("net")
const http = require("http")
const https = require("https")
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

// Additional data for the encrypted signing secret: binds it to its owner.
const webhookSecretContext = (owner) => `webhook:${owner}`

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

function isPrivateIPv4(ip) {
  const [a, b, c] = ip.split(".").map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||        // carrier-grade NAT
    (a === 169 && b === 254) ||                  // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||     // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224                                     // multicast and reserved
  )
}

// Expands any IPv6 text form (including "::" and a trailing dotted IPv4) into
// eight 16-bit groups, or null if it isn't valid.
function ipv6Groups(ip) {
  let text = ip.toLowerCase().split("%")[0]
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    if (!net.isIPv4(dotted[2])) return null
    const [a, b, c, d] = dotted[2].split(".").map(Number)
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail]
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

const groupsToIPv4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip)
  const g = ipv6Groups(ip)
  if (!g) return true // anything we can't parse is treated as unsafe
  const zero = (from, to) => g.slice(from, to).every((x) => x === 0)
  // IPv4 inside IPv6: mapped (::ffff:a.b.c.d), compatible (::a.b.c.d) and NAT64
  // (64:ff9b::a.b.c.d). The URL parser writes these in hex (::ffff:7f00:1), so
  // they must be decoded and checked as IPv4.
  if (zero(0, 5) && g[5] === 0xffff) return isPrivateIPv4(groupsToIPv4(g[6], g[7]))
  if (zero(0, 6)) return g[6] === 0 && g[7] <= 1 ? true : isPrivateIPv4(groupsToIPv4(g[6], g[7]))
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return isPrivateIPv4(groupsToIPv4(g[6], g[7]))
  if (g[0] === 0x2002) return isPrivateIPv4(groupsToIPv4(g[1], g[2])) // 6to4 embeds an IPv4 too
  return (
    (g[0] & 0xfe00) === 0xfc00 ||  // unique local
    (g[0] & 0xffc0) === 0xfe80 ||  // link-local
    (g[0] & 0xffc0) === 0xfec0 ||  // site-local (deprecated)
    (g[0] & 0xff00) === 0xff00 ||  // multicast
    (g[0] === 0x2001 && g[1] === 0x0db8) || // documentation
    (g[0] === 0x0100 && zero(1, 4))         // discard
  )
}

class WebhookUrlError extends Error {}

// Resolves the URL once and checks every address. Returns the URL and the single
// address the delivery must connect to, so a second DNS lookup can never send it
// somewhere else ("DNS rebinding").
async function resolveDeliverableUrl(raw) {
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
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true }).catch(() => [])
  if (!addresses.length) throw new WebhookUrlError("That host name does not resolve")
  if (!allowPrivate() && addresses.some((a) => isPrivateAddress(a.address))) {
    throw new WebhookUrlError("Webhook URLs cannot point to private or internal addresses")
  }
  return { url, host, address: addresses[0].address, family: addresses[0].family }
}

async function assertDeliverableUrl(raw) {
  return (await resolveDeliverableUrl(raw)).url
}

const MAX_RESPONSE_BYTES = 4096

// POSTs to the exact address that was checked. Node's http(s) modules don't
// follow redirects, the response is cut off after a few kilobytes, and the
// original host name is still used for TLS and the Host header.
function postPinned({ url, host, address, family }, headers, body) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: host,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
        servername: net.isIP(host) ? undefined : host,
        lookup: (hostname, options, callback) =>
          options && options.all ? callback(null, [{ address, family }]) : callback(null, address, family),
      },
      (response) => {
        const chunks = []
        let size = 0
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") })
        }
        response.on("data", (chunk) => {
          if (size < MAX_RESPONSE_BYTES) chunks.push(chunk.subarray(0, MAX_RESPONSE_BYTES - size))
          size += chunk.length
          if (size >= MAX_RESPONSE_BYTES) {
            finish()
            response.destroy()
          }
        })
        response.on("end", finish)
        response.on("error", finish)
      }
    )
    const timer = setTimeout(() => request.destroy(Object.assign(new Error("timeout"), { name: "AbortError" })), TIMEOUT_MS)
    request.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    request.end(body)
  })
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
    const target = await resolveDeliverableUrl(hook.url)
    const res = await postPinned(
      target,
      {
        "Content-Type": "application/json",
        "User-Agent": "Learnify-Webhooks/1.0",
        "Learnify-Event": delivery.event,
        "Learnify-Delivery": String(delivery._id),
        "Learnify-Signature": sign(secretBox.open(hook.secret, webhookSecretContext(hook.owner)), body),
      },
      body
    )
    result = { ok: res.status >= 200 && res.status < 300, responseStatus: res.status, responseBody: res.body.slice(0, 500), error: null }
    if (!result.ok) result.error = `HTTP ${res.status}`
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
  resolveDeliverableUrl,
  webhookSecretContext,
  WebhookUrlError,
  deliver,
}
