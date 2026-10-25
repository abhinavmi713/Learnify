# Demo script (about 10 minutes)

A walkthrough that shows the product quickly, then the engineering behind it. Each step names what to click,
what to point out, and the follow-up question it usually prompts.

Setup: `docker compose up -d`, `docker compose --profile observability up -d`, `npm run dev`, the worker
(`cd server && npm run worker`) and the AI service. Open the app, Grafana (:3001), Jaeger (:16686) and the
RabbitMQ console (:15672).

## 1. The product (2 min)

1. Search the navbar for **`javscript`** (typo). It still finds JavaScript Fundamentals, with the matched
   part highlighted. Open the results page: facets show how many courses each category would give.
2. Log in as `student@learnify.com`, buy a course with Razorpay test mode (or apply coupon `WELCOME20` on a
   free course), open it, play a lecture.
3. Ask the assistant "what is a closure?". The answer is labelled "Answered from this course" with a lecture
   link. Ask something off-topic: it says the course does not cover it.

*Question this invites: how does the assistant know the course?* RAG: chunks embedded into Qdrant, filtered
per course, threshold chosen by an evaluation set ([AI.md](AI.md)).

## 2. Events and reliability (2 min)

1. Stop the worker. Submit the contact form or buy a course. The request still succeeds.
2. In RabbitMQ, the `email` queue holds the message. Restart the worker: the email goes out.
3. Explain the outbox: the event row is written in the same transaction as the enrollment, so it cannot be
   lost or sent for something that did not commit. Consumers record event ids, so redelivery is harmless.

*Question: what if the email server is down?* Retry queues with 5 s / 30 s / 2 min delays, then a
dead-letter queue (and an alert).

## 3. Real time (1 min)

Open the same lecture as the student and as the instructor in two windows. Post a question: it appears in
the other window instantly, and the "watching now" count updates. Scaling: the Redis adapter, so this works
across API instances.

## 4. Security (2 min)

1. Settings → Security as an admin: turn on two-factor authentication (scan the QR with an authenticator
   app), see the recovery codes, log out and back in with a code.
2. Active sessions: sign out another device.
3. Admin → Audit Log: the logins, the 2FA change and course approvals are all there, and entries cannot be
   edited.
4. Explain refresh-token rotation: a reused refresh token revokes the whole login (theft detection).

*Question: why not keep the JWT for 24 hours?* It could not be revoked; now a leaked access token lives 15
minutes and the refresh token is httpOnly, path-scoped and single-use.

## 5. Observability (2 min)

1. Grafana dashboard: request rate and p95 per route, cache hit ratio, outbox lag, queue depth, open
   circuit breakers.
2. Jaeger: open the trace for the contact form. One trace spans the HTTP request, the outbox write, the
   RabbitMQ publish and the worker's processing, across processes.
3. Stop Elasticsearch: search keeps working (`engine: "mongo"`), and the search-engine panel shows the
   fallback.

## 6. Performance story (1 min)

Open [PERFORMANCE.md](PERFORMANCE.md):
- **Redis cache:** about 8.5x the throughput of hitting MongoDB.
- **`explain()`:** profile stats scanned 200,000 rows; now they read 12.
- **k6, search:** highlighting with a fuzzy query cost about 300 ms per search; fixed to about 10 ms.
- **k6, catalog:** the endpoint returned the whole catalog (3.5 MB); journey p95 went from 8.3 s to 25 ms.

The message: the numbers came from measuring, and two of the fixes came from load tests, not guesses.

## Likely follow-up questions

| Question | Short answer | Where |
|---|---|---|
| Why not microservices? | Shared data and transactions; split only what has a different runtime profile | [DECISIONS.md §1](DECISIONS.md#1-a-modular-monolith-plus-two-services) |
| Why RabbitMQ, not Kafka/BullMQ? | Fan-out with per-consumer retries and DLQs; no need for log retention | §2 |
| Exactly-once delivery? | At-least-once delivery plus idempotent consumers gives effectively-once | §3 |
| What if Redis dies? | Everything falls back to per-process; nothing errors | [ARCHITECTURE.md](ARCHITECTURE.md#failure-behaviour) |
| How do you keep the search index consistent? | Events trigger a re-read of the source of truth; full rebuild with alias swap | [SEARCH.md](SEARCH.md) |
| How are webhooks secured? | HMAC with timestamp, SSRF checks at save and send, per-delivery retries | [OBSERVABILITY.md](OBSERVABILITY.md#instructor-webhooks-serverutilswebhooksjs) |
| How do you test all this? | Jest with an in-memory replica set, fakes for the broker and search, integration jobs against real RabbitMQ and Elasticsearch in CI, k6 for load | README |
