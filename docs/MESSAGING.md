# Messaging, outbox and background work (Phase 2)

## Why

Sending an email, issuing a refund or calling any third party inside an HTTP request makes the request as
slow and as fragile as that third party, and a crash between "save the data" and "tell someone" loses the
side effect. Learnify now records an **event** in the same database transaction as the business change, and
a **worker** performs the side effect later, with retries.

```
 request ──▶ [ Mongo transaction: business write + OutboxEvent row ] ──▶ 200 OK
                                    │
                        outbox relay (polls, claims atomically)
                                    │  publish + broker confirm
                                    ▼
                     RabbitMQ  learnify.events (topic)
                       │                         │
                 queue "email"             queue "refund"
                       │                         │
        worker (idempotent, retries → DLQ)   worker
```

## Pieces

| File | Role |
|---|---|
| `models/OutboxEvent.js`, `events/outbox.js` | `enqueueEvent(type, payload, { session })`: durable event row, written inside the caller's transaction |
| `events/relay.js` | Claims pending rows (`findOneAndUpdate`, safe with several relays), publishes, marks `sent` only after the broker confirms; exponential backoff; reclaims rows locked by a dead relay |
| `config/rabbit.js` | Connection with auto-reconnect, confirm channels, topology, consumer runtime with retry queues and a DLQ |
| `events/publisher.js`, `events/localBus.js` | Without `RABBITMQ_URL` events are handled in-process by the same consumers (dev and tests need no Docker) |
| `workers/consumers.js` | Which queue handles which event types |
| `workers/runner.js`, `models/ProcessedEvent.js` | Idempotent consumption: a repeat delivery is acknowledged without repeating the side effect |
| `workers/handlers/email.js` | Sends OTP, welcome, enrolment, certificate, password and contact emails (behind a circuit breaker) |
| `workers/handlers/refund.js` | Refund half of the checkout saga |
| `utils/transaction.js` | `runInTransaction`; falls back to no transaction on a standalone MongoDB |
| `utils/resilience.js` | `withTimeout`, `retry` (backoff + jitter), `withBreaker` (opossum circuit breaker) |

Events: `user.registered`, `otp.requested`, `password.reset_requested`, `password.changed`, `order.paid`,
`course.completed`, `contact.submitted`, `payment.refund_requested`.

## Guarantees and trade-offs

- **At-least-once delivery.** The outbox can republish and the broker can redeliver, so every consumer is
  idempotent (`ProcessedEvent` records `(consumer, eventId)` after success). The marker is written *after* the
  handler: written before, a crash would make the retry skip work that never happened. The small cost is that a
  crash right after the handler can repeat an email.
- **No ordering guarantee** across events. Handlers do not depend on it.
- **Secrets.** OTP and reset-link payloads are wiped from the outbox as soon as they are delivered.
- **Retries.** A failing handler is re-queued through `<queue>.retry.N` (message TTL = delay, then dead-lettered
  back to the work queue): email waits 5 s, 30 s, 2 min; refunds 10 s, 1 min, 5 min, 15 min. After the last
  attempt the message goes to `<queue>.dlq` with `x-attempts` and `x-last-error` headers. An unparseable message
  goes straight to the DLQ.
- **Broker down.** `publish` throws, the outbox row stays `pending` and is retried with backoff (2 s doubling, max
  60 s, 25 attempts). Requests keep succeeding.

## Checkout saga

`fulfillOrder` runs enrolment + payment record + coupon count + `order.paid` event in **one** transaction.
If a paid order cannot be delivered (all its courses were removed) it throws `FulfillmentError`, and the
compensating step `compensateFailedFulfillment` records the payment as `refund_pending` and queues
`payment.refund_requested`. The refund worker calls Razorpay (timeout + breaker), treats "already refunded" as
success, marks the record `refunded`, and notifies the student. The payment itself cannot be rolled back by a
database transaction because the money lives at the provider, which is why this is a saga with a compensation.

## Running it

```bash
docker compose up -d                 # mongo (replica set), redis, rabbitmq, qdrant
cd server
npm start                            # API (+ outbox relay; hosts the worker too when RABBITMQ_URL is set locally)
npm run worker                       # or a separate worker process (scale by running more)
npm run outbox:status                # recent events and backlog
# RabbitMQ management UI: http://localhost:15672  (guest / guest)
```

Tests: `npm test` needs no Docker. The broker integration test runs when you opt in:
`RABBITMQ_TEST_URL=amqp://guest:guest@127.0.0.1:5672 npx jest tests/rabbit.integration.test.js`.

## Failure drills that were run against the real stack

1. **Worker stopped.** Three OTP requests succeed; three messages wait in the `email` queue; one restarted
   worker sends all three.
2. **Broker stopped.** `/health` shows `rabbitmq: down` yet stays `ok`; two requests succeed; both outbox rows sit
   `pending` with growing `attempts`; when RabbitMQ returns they are published and emailed (payloads redacted).
3. **Bad messages.** An unparseable message lands in `email.dlq`; a handler that keeps failing is retried after the
   configured delay (attempt 1 to 2 took 5 s) and would reach the DLQ after the last attempt.
