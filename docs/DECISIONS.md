# Design decisions

Short records of the choices that shaped the system: the problem, what was chosen, what was rejected, and
the cost. Measured numbers are in [PERFORMANCE.md](PERFORMANCE.md).

## 1. A modular monolith plus two services

**Problem.** Some work is slow or unreliable (email, refunds, re-indexing, webhooks, LLM calls). Doing it
inside requests makes requests slow and fragile.

**Decision.** Keep one API codebase for the business domain (auth, courses, payments, profiles), and move
out only what has a genuinely different runtime profile: the **worker** (asynchronous side effects) and the
**AI service** (slow, expensive, separately scalable model calls with their own vector store).

**Rejected.** A service per domain (users, courses, payments). These domains share data and transactions
(paying enrolls you in a course and creates progress records). Splitting them would turn local
transactions into distributed ones and every page into several network calls, for a team of one.

**Cost.** One deployable for most of the code. Boundaries are kept by folder structure and events, so a
domain could be extracted later.

## 2. RabbitMQ (not BullMQ or Kafka)

**Decision.** RabbitMQ with a topic exchange for domain events, a queue per consumer, TTL retry queues with
increasing delays, and a dead-letter queue per consumer.

**Why.** One event (`order.paid`) has several independent consumers (email, search, webhooks), and each
needs its own retry state and failure isolation. Topic routing gives each consumer its own queue for free.

**Rejected.**
- BullMQ is a job queue on Redis: good for "run this job", awkward for one event fanned out to many
  consumers, and it would make Redis (deliberately optional, see 6) critical.
- Kafka is built for log retention and replay at very high throughput. That's operational weight with no
  need here; the outbox table already gives replay.

**Cost.** Another piece of infrastructure. The app runs without it: the same consumers run in-process.

## 3. Transactional outbox instead of publishing directly

**Problem.** "Save the order, then publish an event" is a dual write. A crash between the two loses the
event, and publishing first can announce something that then fails to commit.

**Decision.** The event is inserted into an `OutboxEvent` collection in the same MongoDB transaction as the
business change. A relay publishes pending rows with publisher confirms, claims rows atomically (safe with
several relays) and retries with backoff. Consumers record processed event ids, so redelivery has no effect.

**Cost.** Delivery is at-least-once with a small delay (the relay polls), and MongoDB must run as a replica
set (needed for transactions anyway).

## 4. Saga with compensation for checkout

Money is taken by Razorpay before enrollment. If enrollment cannot be completed (course archived meanwhile),
the order is marked `refund_pending` and a refund event is published. The refund consumer calls Razorpay,
retries patiently, and parks failures for a human. There is no distributed transaction, only steps with
defined compensations.

## 5. Redis cache-aside with versioned keys

**Decision.** Cache GET responses in Redis with key `cache:<namespace>:<version>:<url>`. Invalidation is one
`INCR` of the namespace version, so old entries are never read again and expire on their own. A short
single-flight lock lets one request rebuild a missing entry while concurrent requests wait for it (no
stampede on expiry). TTLs get jitter.

**Rejected.** An in-process cache (`node-cache`): about 24% faster per hit, but every instance has its own
copy, invalidation reaches only the instance that made the change, and the hit ratio falls as instances
are added.

## 6. Every infrastructure dependency is optional

Redis, RabbitMQ, Elasticsearch, Qdrant, the AI service and tracing each degrade to an in-process or simpler
equivalent when unset or down, behind circuit breakers where calls are remote. This makes the test suite and
a laptop setup need nothing but MongoDB. In production, a dependency failure means a feature runs degraded,
not an outage. The cost is two code paths for some features; both are covered by tests.

## 7. Short access tokens plus rotating refresh tokens

**Problem.** A single 24-hour JWT in localStorage. If it leaked, it worked for a day.

**Decision.**
- **Access tokens:** 15 minutes, sent in the `Authorization` header and never read from cookies, so
  ordinary routes cannot be forged cross-site.
- **Refresh tokens:** an opaque random value, stored only as a hash, in an httpOnly cookie scoped to
  `/api/v1/auth`. Each one is single-use and rotates on every refresh. Presenting a used one revokes the
  whole login family (theft detection). A 10-second grace window covers two tabs refreshing at once.
- **Instant revocation:** logout puts the token's `jti` on a Redis denylist, and password changes bump
  `tokenVersion`.

**Rejected.**
- Server-side sessions only: a database or Redis lookup for every request plus a sticky cookie.
- Long-lived JWTs: they cannot be revoked.

**Cost.** Refresh logic in the client (one retry after a single shared refresh), and the cookie needs
`SameSite=None; Secure` when the frontend and API are on different sites.

## 8. Permissions, not roles, in routes

Routes ask for permissions (`coupon:manage`). One table maps roles to permissions, and the role is read from
the database on every request, so a demotion applies immediately. Failed authorization returns `403`, not
`401`, so clients do not mistake it for an expired session.

## 9. Elasticsearch for search, MongoDB as fallback

**Problem.** MongoDB `$text` plus regex: no typo tolerance, no partial-word matching with ranking, no facets,
and a regex scans the collection.

**Decision.**
- **Index:** a strict mapping with stemming, an edge n-gram subfield for autocomplete, boosts per field,
  popularity scoring, facets via `post_filter`, and a versioned index behind an alias for zero-downtime
  rebuilds.
- **Freshness:** the index is updated by a consumer that re-reads the course on every relevant event, so
  out-of-order or repeated events still converge.

**Rejected.** MongoDB Atlas Search: it ties local development and tests to Atlas.

**Cost.** One more system, and an index that lags writes by about a second. Measured: 76 ms p95 vs 4.3 s for
the MongoDB fallback under the same load, and it finds results for typos.

## 10. RAG instead of prompt stuffing

Retrieval returns the few relevant chunks of the current course, so the model sees what matters, can cite
lectures, and can say "not covered" honestly. Putting a whole course in the prompt grows the cost with
course size and gives no citations.

Qdrant was chosen for payload filtering per course and a simple HTTP API. The similarity threshold was
chosen with a small evaluation set (all answerable questions found, all off-topic ones rejected at 0.60).
Access is checked in the API before the AI service is called.

## 11. Keyset pagination for long lists

`skip`/`limit` gets slower with depth and shifts when rows are inserted while paging. The catalog,
notifications, the audit log and webhook deliveries use a cursor (`createdAt` + `_id`, or `_id`) on a
matching index. Admin tables with page numbers keep offset pagination, where jumping to a page matters more.

## 12. Measure, then optimize

Indexes were chosen from `explain()` output on synthetic data, not guesses. That showed a low-selectivity
index slower than a collection scan, and a `$in: [x, null]` that silently prevents a covered query. k6 runs
then found two problems no unit test would:
- **Highlighting:** reusing the fuzzy query for highlighting cost about 300 ms per search.
- **Catalog:** an unpaginated endpoint returned 3.5 MB.

## 13. Generated API docs

The OpenAPI document is built from the running Express router, the zod validators and metadata on the
middleware. A hand-written spec drifts from the code; a generated one cannot. The cost is less prose per
endpoint.

## 14. Webhooks as a public contract

Webhook event names and payloads are separate from internal event names, so internals can change freely.
Each delivery is signed (HMAC with timestamp), retried independently, and recorded. URLs are checked against
internal and private address ranges, both when saved and before every delivery, because a webhook URL makes
the server send requests on a user's behalf (SSRF).
