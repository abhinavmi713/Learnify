# Learnify API server

Express API, background worker and outbox relay for Learnify. The project overview, architecture and
design decisions live in the root [README](../README.md) and [docs/](../docs).

## Run it

```bash
npm install
cp .env.example .env      # fill in MONGODB_URL, JWT_SECRET and the rest
npm run dev               # API on http://localhost:4000, with the in-process event bus
npm run worker            # the RabbitMQ worker (only when RABBITMQ_URL is set)
```

Without `REDIS_URL`, `RABBITMQ_URL` and `ELASTICSEARCH_URL`, the server falls back to in-process caching, an
in-process event bus and MongoDB search, so it runs with MongoDB alone. Transactions need MongoDB as a replica
set; Docker Compose starts one. API documentation is served at `/api/docs` outside production.

## Layout

| Folder | Contents |
|---|---|
| `routes/` | URL to middleware and controller wiring |
| `controllers/` | Request handlers |
| `middleware/` | Auth, validation, idempotency, rate limits, uploads, errors |
| `models/` | Mongoose schemas and indexes |
| `validators/` | Zod schemas for request bodies |
| `events/` | Outbox, relay and publisher (see docs/MESSAGING.md) |
| `workers/` | RabbitMQ consumers: email, refunds, search indexing, webhooks |
| `search/` | Elasticsearch index and queries |
| `realtime/` | Socket.IO server |
| `scripts/` | Seeding, backups, index sync, outbox and DLQ tools |
| `tests/` | Jest tests against an in-memory MongoDB replica set |

## Useful scripts

| Command | What it does |
|---|---|
| `npm test` | Run the test suite |
| `npm run seed:demo` | Add demo data to a development database (refuses in production) |
| `npm run db:indexes` | Make every collection's indexes match its schema (run on deploy) |
| `npm run db:app-role` | Create a database role and user that can only insert into the audit log |
| `npm run outbox:status` | Show recent outbox events and the backlog |
| `npm run outbox:requeue` | Requeue outbox events the relay gave up on |
| `npm run dlq:replay -- <queue>` | Move dead-lettered messages back to their queue |
| `npm run search:reindex` | Rebuild the Elasticsearch index with zero downtime |
| `npm run perf:explain` | Measure the hot queries with explain() |
