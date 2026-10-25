const { z } = require("zod")
const { WEBHOOK_EVENTS } = require("../utils/webhooks")

const events = z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Pick at least one event").max(WEBHOOK_EVENTS.length)

const createWebhookSchema = z.object({
  url: z.string().trim().url("Enter a valid URL").max(2000),
  events,
  description: z.string().trim().max(200).optional(),
})

const updateWebhookSchema = z
  .object({
    url: z.string().trim().url("Enter a valid URL").max(2000).optional(),
    events: events.optional(),
    description: z.string().trim().max(200).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })

module.exports = { createWebhookSchema, updateWebhookSchema }
