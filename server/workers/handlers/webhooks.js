const mongoose = require("mongoose")
const Course = require("../../models/Course")
const User = require("../../models/User")
const Webhook = require("../../models/Webhook")
const WebhookDelivery = require("../../models/WebhookDelivery")
const { EVENTS } = require("../../events/types")
const { enqueueEvent } = require("../../events/outbox")
const { runInTransaction } = require("../../utils/transaction")
const { deliver } = require("../../utils/webhooks")

// Domain event -> the public webhook events it produces, one per affected course
// owner. Internal event names and payloads stay private; this is the contract.
async function toWebhookEvents(event) {
  const p = event.payload
  const course = (id) => Course.findById(id).select("courseName instructor").lean()
  switch (event.type) {
    case EVENTS.ORDER_PAID: {
      const student = await User.findById(p.userId).select("firstName lastName").lean()
      const out = []
      for (const id of p.courseIds || []) {
        const c = await course(id)
        if (c) {
          out.push({
            owner: c.instructor,
            event: "enrollment.created",
            data: {
              courseId: String(id),
              courseName: c.courseName,
              student: student ? { id: String(p.userId), firstName: student.firstName, lastName: student.lastName } : { id: String(p.userId) },
              orderId: p.orderId,
            },
          })
        }
      }
      return out
    }
    case EVENTS.REVIEW_CREATED: {
      const c = await course(p.courseId)
      return c ? [{ owner: c.instructor, event: "review.created", data: { courseId: p.courseId, courseName: c.courseName, reviewId: p.reviewId, rating: p.rating, review: p.review } }] : []
    }
    case EVENTS.COURSE_PUBLISHED:
    case EVENTS.COURSE_REJECTED: {
      const c = await course(p.courseId)
      if (!c) return []
      const published = event.type === EVENTS.COURSE_PUBLISHED
      return [
        {
          owner: c.instructor,
          event: published ? "course.published" : "course.rejected",
          data: { courseId: p.courseId, courseName: c.courseName, ...(published ? {} : { reason: p.reason }) },
        },
      ]
    }
    default:
      return []
  }
}

// Fan-out: one delivery per subscribed webhook. Each delivery row and the event
// that sends it are written in one transaction, and (webhook, source event,
// webhook event) is unique, so a redelivered domain event creates nothing twice.
async function handleWebhookFanout(event) {
  for (const item of await toWebhookEvents(event)) {
    const hooks = await Webhook.find({ owner: item.owner, active: true, events: item.event }).select("_id owner").lean()
    for (const hook of hooks) {
      try {
        await runInTransaction(async (session) => {
          const opts = session ? { session } : {}
          const [delivery] = await WebhookDelivery.create(
            [{ webhook: hook._id, owner: hook.owner, event: item.event, payload: item.data, sourceEventId: `${event.id}:${item.event}:${item.data.courseId}` }],
            opts
          )
          await enqueueEvent(EVENTS.WEBHOOK_DELIVERY_REQUESTED, { deliveryId: String(delivery._id) }, { session })
        })
      } catch (error) {
        if (error.code !== 11000) throw error // already fanned out
      }
    }
  }
}

async function handleWebhookDelivery(event, meta = {}) {
  if (!mongoose.isValidObjectId(event.payload.deliveryId)) return
  await deliver(event.payload.deliveryId, { finalAttempt: Boolean(meta.finalAttempt) })
}

module.exports = { handleWebhookFanout, handleWebhookDelivery, toWebhookEvents }
