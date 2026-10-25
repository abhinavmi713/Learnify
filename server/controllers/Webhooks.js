const mongoose = require("mongoose")
const Webhook = require("../models/Webhook")
const WebhookDelivery = require("../models/WebhookDelivery")
const secretBox = require("../utils/secretBox")
const { enqueueEvent } = require("../events/outbox")
const { EVENTS } = require("../events/types")
const { runInTransaction } = require("../utils/transaction")
const { recordAudit } = require("../utils/audit")
const { WEBHOOK_EVENTS, newSecret, assertDeliverableUrl, WebhookUrlError } = require("../utils/webhooks")

const MAX_WEBHOOKS = 10

const view = (hook) => ({
  _id: hook._id,
  url: hook.url,
  description: hook.description,
  events: hook.events,
  active: hook.active,
  disabledReason: hook.disabledReason,
  consecutiveFailures: hook.consecutiveFailures,
  lastDeliveryAt: hook.lastDeliveryAt,
  createdAt: hook.createdAt,
})

async function ownHook(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ success: false, message: "Webhook not found" })
    return null
  }
  const hook = await Webhook.findOne({ _id: req.params.id, owner: req.user.id })
  if (!hook) res.status(404).json({ success: false, message: "Webhook not found" })
  return hook
}

async function checkedUrl(res, url) {
  try {
    await assertDeliverableUrl(url)
    return true
  } catch (error) {
    if (!(error instanceof WebhookUrlError)) throw error
    res.status(400).json({ success: false, message: error.message })
    return false
  }
}

// Creates a delivery and the event that sends it, atomically.
async function queueDelivery(hook, event, payload) {
  let delivery
  await runInTransaction(async (session) => {
    const opts = session ? { session } : {}
    ;[delivery] = await WebhookDelivery.create([{ webhook: hook._id, owner: hook.owner, event, payload }], opts)
    await enqueueEvent(EVENTS.WEBHOOK_DELIVERY_REQUESTED, { deliveryId: String(delivery._id) }, { session })
  })
  return delivery
}

exports.listEvents = (req, res) => res.status(200).json({ success: true, data: WEBHOOK_EVENTS })

exports.listWebhooks = async (req, res) => {
  const hooks = await Webhook.find({ owner: req.user.id }).sort({ createdAt: -1 })
  return res.status(200).json({ success: true, data: hooks.map(view) })
}

// The signing secret is returned once, here and on rotation; afterwards it is
// only stored encrypted.
exports.createWebhook = async (req, res) => {
  if (!secretBox.isConfigured()) {
    return res.status(503).json({ success: false, message: "Webhooks are not available on this server" })
  }
  const { url, events, description } = req.body
  if (!(await checkedUrl(res, url))) return
  if ((await Webhook.countDocuments({ owner: req.user.id })) >= MAX_WEBHOOKS) {
    return res.status(400).json({ success: false, message: `You can have at most ${MAX_WEBHOOKS} webhooks` })
  }
  const secret = newSecret()
  const hook = await Webhook.create({ owner: req.user.id, url, events, description, secret: secretBox.seal(secret) })
  await recordAudit(req, { action: "webhook.create", targetType: "webhook", targetId: hook._id, metadata: { url, events } })
  return res.status(201).json({ success: true, data: { ...view(hook), secret } })
}

exports.updateWebhook = async (req, res) => {
  const hook = await ownHook(req, res)
  if (!hook) return
  const { url, events, description, active } = req.body
  if (url !== undefined) {
    if (!(await checkedUrl(res, url))) return
    hook.url = url
  }
  if (events !== undefined) hook.events = events
  if (description !== undefined) hook.description = description
  if (active !== undefined) {
    hook.active = active
    // Re-enabling after an automatic pause starts the failure count afresh.
    if (active) {
      hook.disabledReason = null
      hook.consecutiveFailures = 0
    }
  }
  await hook.save()
  await recordAudit(req, { action: "webhook.update", targetType: "webhook", targetId: hook._id, metadata: req.body })
  return res.status(200).json({ success: true, data: view(hook) })
}

exports.rotateSecret = async (req, res) => {
  const hook = await ownHook(req, res)
  if (!hook) return
  const secret = newSecret()
  hook.secret = secretBox.seal(secret)
  await hook.save()
  await recordAudit(req, { action: "webhook.rotate_secret", targetType: "webhook", targetId: hook._id })
  return res.status(200).json({ success: true, data: { secret } })
}

exports.deleteWebhook = async (req, res) => {
  const hook = await ownHook(req, res)
  if (!hook) return
  await Webhook.deleteOne({ _id: hook._id })
  await WebhookDelivery.deleteMany({ webhook: hook._id })
  await recordAudit(req, { action: "webhook.delete", targetType: "webhook", targetId: hook._id, metadata: { url: hook.url } })
  return res.status(200).json({ success: true, message: "Webhook deleted" })
}

// Sends a "ping" so instructors can check their endpoint and signature code.
exports.testWebhook = async (req, res) => {
  const hook = await ownHook(req, res)
  if (!hook) return
  const delivery = await queueDelivery(hook, "ping", { message: "Test delivery from Learnify", webhookId: String(hook._id) })
  return res.status(202).json({ success: true, message: "Test delivery queued", data: { deliveryId: delivery._id } })
}

// Newest first, cursor = id of the last delivery seen.
exports.listDeliveries = async (req, res) => {
  const hook = await ownHook(req, res)
  if (!hook) return
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20))
  const filter = { webhook: hook._id }
  if (req.query.before && mongoose.isValidObjectId(req.query.before)) filter._id = { $lt: new mongoose.Types.ObjectId(String(req.query.before)) }
  const rows = await WebhookDelivery.find(filter).sort({ _id: -1 }).limit(limit + 1).lean()
  const page = rows.slice(0, limit)
  return res.status(200).json({ success: true, data: page, nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null })
}

exports.redeliver = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.deliveryId)) return res.status(404).json({ success: false, message: "Delivery not found" })
  const original = await WebhookDelivery.findOne({ _id: req.params.deliveryId, owner: req.user.id }).lean()
  if (!original) return res.status(404).json({ success: false, message: "Delivery not found" })
  const hook = await Webhook.findOne({ _id: original.webhook, owner: req.user.id })
  if (!hook) return res.status(404).json({ success: false, message: "Webhook not found" })
  const delivery = await queueDelivery(hook, original.event, original.payload)
  return res.status(202).json({ success: true, message: "Redelivery queued", data: { deliveryId: delivery._id } })
}
