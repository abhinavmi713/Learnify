const { EVENTS } = require("../events/types")
const { handleEmailEvent } = require("./handlers/email")
const { handleRefund } = require("./handlers/refund")
const { handleSearchIndex } = require("./handlers/searchIndex")
const { handleWebhookFanout, handleWebhookDelivery } = require("./handlers/webhooks")

// Every background consumer: which queue, which event types it listens to, and
// what it does. The same definitions are used by the RabbitMQ worker
// (workers/index.js) and by the in-process bus (events/localBus.js).
const consumers = [
  {
    name: "email",
    bindings: [
      EVENTS.OTP_REQUESTED,
      EVENTS.PASSWORD_RESET_REQUESTED,
      EVENTS.PASSWORD_CHANGED,
      EVENTS.USER_REGISTERED,
      EVENTS.ORDER_PAID,
      EVENTS.COURSE_COMPLETED,
      EVENTS.CONTACT_SUBMITTED,
    ],
    handler: handleEmailEvent,
  },
  {
    name: "refund",
    bindings: [EVENTS.PAYMENT_REFUND_REQUESTED],
    handler: handleRefund,
    // Money movement: retry more patiently before involving a human.
    retryDelaysMs: [10000, 60000, 300000, 900000],
  },
  {
    name: "search-indexer",
    // New enrollments change popularity; ratings change ranking; edits,
    // approvals and archiving change what is searchable.
    bindings: [EVENTS.COURSE_CONTENT_CHANGED, EVENTS.REVIEW_CREATED, EVENTS.ORDER_PAID],
    handler: handleSearchIndex,
  },
  {
    name: "webhook-fanout",
    bindings: [EVENTS.ORDER_PAID, EVENTS.REVIEW_CREATED, EVENTS.COURSE_PUBLISHED, EVENTS.COURSE_REJECTED],
    handler: handleWebhookFanout,
  },
  {
    // Each delivery is its own message: one slow or broken endpoint never holds
    // up the others, and retries back off per delivery.
    name: "webhook-delivery",
    bindings: [EVENTS.WEBHOOK_DELIVERY_REQUESTED],
    handler: handleWebhookDelivery,
    retryDelaysMs: [10000, 60000, 300000, 1800000],
  },
]

module.exports = { consumers }
