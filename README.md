# Learnify

A full-stack e-learning platform (MERN) built to production standards: instructors publish video courses,
students buy them, learn, take quizzes and earn verifiable certificates, and an AI assistant answers
questions from the course's own lectures.

Behind the product is the backend most tutorials skip: an event-driven architecture with a transactional
outbox and RabbitMQ, Redis caching and distributed rate limiting, Elasticsearch search, a RAG
microservice, real-time updates over Socket.IO, refresh-token rotation and 2FA, an audit log, idempotency
keys, Prometheus metrics, distributed tracing, and k6 load tests with measured results.

| Docs | |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Components, request and event flows, failure behaviour |
| [Design decisions](docs/DECISIONS.md) | Why each technology and pattern, and what was traded off |
| [Performance](docs/PERFORMANCE.md) | Measured results: caching, indexes, search, load tests |
| [Deployment](docs/DEPLOYMENT.md) | Step-by-step guide to run it live |
| [Demo script](docs/DEMO.md) | A 10-minute walkthrough of the interesting parts |
| Deep dives | [Messaging](docs/MESSAGING.md) · [AI / RAG](docs/AI.md) · [Security](docs/SECURITY.md) · [Search](docs/SEARCH.md) · [Observability](docs/OBSERVABILITY.md) |

## Features

**Students:** browse and search the catalog (typo-tolerant, autocomplete), wishlist, cart and coupons, Razorpay
checkout, video player with progress tracking, notes, live lecture Q&A, quizzes, certificates with a public
verification page, learning paths, live classes with chat, and a course-aware AI study assistant with
citations.

**Instructors:** course builder (sections, lectures, direct-to-Cloudinary video upload, transcripts),
quizzes, live classes, a dashboard with revenue and enrollment trends, and signed webhooks for their own
integrations.

**Admins:** course moderation, user management, categories, coupons, learning paths, platform analytics and
an append-only audit log.

**Accounts:** OTP-verified signup, 15-minute access tokens with rotating refresh tokens, session list and
"sign out everywhere", optional TOTP two-factor login with recovery codes, account lockout.

## Architecture at a glance

```mermaid
flowchart LR
  B[React SPA] -->|REST + Socket.IO| API[API: Express]
  API --> M[(MongoDB replica set)]
  API --> R[(Redis)]
  API --> ES[(Elasticsearch)]
  API -->|outbox relay| Q{{RabbitMQ}}
  Q --> W[Worker: email, refunds, search index, webhooks]
  Q --> AI[AI service: RAG]
  AI --> QD[(Qdrant)]
  AI --> G[Gemini]
  API -->|ask| AI
  W -->|socket emitter| R
```

A modular monolith (API) plus two separately deployable processes: the **worker** (all slow or
failure-prone side effects) and the **AI service** (course-grounded answers). See
[ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 18, Redux Toolkit, React Router, Tailwind CSS, Socket.IO client |
| API | Node.js 20, Express, Mongoose, zod validation, pino logging |
| Data | MongoDB (replica set, transactions), Redis, Elasticsearch, Qdrant |
| Messaging | RabbitMQ (topic exchange, retry queues, dead-letter queues), transactional outbox |
| AI | Google Gemini (embeddings + generation), retrieval-augmented generation |
| Real-time | Socket.IO with the Redis adapter |
| Integrations | Razorpay, Cloudinary, SMTP |
| Observability | Prometheus, Grafana, OpenTelemetry, Jaeger, Sentry |
| Quality | Jest + Supertest (in-memory MongoDB), React Testing Library, k6, GitHub Actions |

## Quick start

Requirements: Node.js 20+, Docker Desktop.

```bash
git clone https://github.com/abhinavmi713/Learnify.git
cd Learnify
docker compose up -d                 # MongoDB, Redis, RabbitMQ, Qdrant, Elasticsearch
npm install && (cd server && npm install)
cp server/.env.example server/.env   # fill in the values (see below)
cp .env.example .env                 # REACT_APP_BASE_URL=http://localhost:4000
```

Minimum `server/.env` for local use:

```
MONGODB_URL=mongodb://127.0.0.1:27018/learnify?directConnection=true
JWT_SECRET=<long random string>
REDIS_URL=redis://127.0.0.1:6379
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
ELASTICSEARCH_URL=http://127.0.0.1:9200
```

Payments, uploads, email and the AI assistant need their own keys (Razorpay test keys, Cloudinary, SMTP,
Gemini). Without them the rest of the app still works, and signup OTPs are printed to the API log in
development.

```bash
cd server
npm run seed:demo          # demo accounts, categories, courses, coupon, learning path
npm run search:reindex     # build the search index
cd ..
npm run dev                # frontend on :3000 and API on :4000 (the API also runs the consumers locally)
```

Demo accounts (password `Learnify@123`, local only): `admin@learnify.com`, `instructor@learnify.com`,
`student@learnify.com`. Coupon `WELCOME20`.

Optional:

```bash
cd ai-service && cp .env.example .env && npm install && npm start && npm run reindex   # AI assistant (RAG)
docker compose --profile observability up -d   # Grafana :3001, Prometheus :9090, Jaeger :16686
```

API reference: http://localhost:4000/api/docs (generated from the routes).

## Running without Docker

Every infrastructure dependency is optional. With only `MONGODB_URL` and `JWT_SECRET` set, the app runs
with in-process equivalents: a memory cache and rate limits, an in-process event bus instead of RabbitMQ,
MongoDB search instead of Elasticsearch, and no AI retrieval. This is also how the test suite runs.

## Tests

```bash
cd server && npm test                    # 150+ API tests, in-memory MongoDB replica set
cd ai-service && npm test                # chunking, retrieval, prompt and API tests
npm test -- --watchAll=false             # frontend
RABBITMQ_TEST_URL=amqp://guest:guest@127.0.0.1:5672 ES_TEST_URL=http://127.0.0.1:9200 \
  npx jest tests/rabbit.integration.test.js tests/search.test.js     # against real services (server/)
```

CI runs all of these on every push, plus Docker image builds that are published to GitHub Container
Registry from `main`.

## Project structure

```
src/                     React app (pages, components, Redux slices, API clients)
server/
  routes/ controllers/   HTTP API
  models/                Mongoose schemas and indexes
  middleware/            auth + RBAC, validation, rate limits, idempotency keys
  events/ workers/       outbox, relay, RabbitMQ consumers
  search/                Elasticsearch index and queries
  realtime/              Socket.IO
  utils/                 cache, sessions, audit, metrics, webhooks, resilience, ...
  openapi/               OpenAPI generator
  loadtest/              k6 scripts and load data seeding
  tests/                 Jest + Supertest
ai-service/              RAG microservice (chunking, embeddings, Qdrant, answering)
observability/           Prometheus, alert rules, Grafana dashboard
docs/                    architecture, decisions, performance, deployment
```

## Useful server scripts

| Command | |
|---|---|
| `npm run worker` | Run the background consumers (production runs them separately from the API) |
| `npm run seed:demo` / `-- --clean` | Add or remove the demo data |
| `npm run create-admin` | Create an admin account (signup cannot) |
| `npm run search:reindex` | Rebuild the search index with a zero-downtime alias swap |
| `npm run outbox:status` | Pending, failed and recent events |
| `npm run perf:explain` | `explain()` the hot queries before and after the indexes |
| `npm run backup` | Database backup with retention |
