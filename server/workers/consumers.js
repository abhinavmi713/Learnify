const { EVENTS } = require("../events/types")
const { handleEmailEvent } = require("./handlers/email")
const { handleRefund } = require("./handlers/refund")

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
]

module.exports = { consumers }
