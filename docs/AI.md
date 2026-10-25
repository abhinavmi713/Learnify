# Course AI assistant: RAG microservice (Phase 4)

## Why

The old chatbot pasted a course blurb into a prompt. It could not see lecture content, could not say where an
answer came from, and answered off-topic questions as if the course covered them. The assistant now
**retrieves** the relevant parts of the course the student is in, answers only from them, **cites** the
lectures it used, and says plainly when the course does not cover something.

It is the one piece extracted into its own service (`ai-service/`): it has different scaling and failure
characteristics (slow, external model calls, its own vector store) and can be deployed, scaled and restarted
without touching the API.

```
 instructor edits a lecture
        │
 API ── 2xx ──▶ OutboxEvent "course.content_changed" ──▶ RabbitMQ ──▶ ai-service consumer (queue ai-indexer)
                                                                         │ GET /api/v1/internal/courses/:id/content
                                                                         │ chunk → embed (Gemini) → replace points
                                                                         ▼
                                                                      Qdrant  course_chunks
                                                                         ▲
 student asks ──▶ API /chatbot/chat ── participant? ──▶ ai-service /v1/ask
                    (auth, rate limits)   no: plain answer      embed query → top-k in THIS course (score ≥ MIN_SCORE)
                                                                 → grounded prompt → answer + citations
```

## Pieces

| File | Role |
|---|---|
| `server/routes/internal.js` | Service-to-service API, `X-Internal-Token` (timing-safe compare). Course content incl. transcripts; list of published courses |
| `server/utils/contentEvents.js` | Route middleware: after a successful content change, enqueue `course.content_changed {courseId}` |
| `server/utils/aiService.js` | Client with circuit breaker + 20 s timeout |
| `server/routes/chatbot.js` | Only course participants (enrolled, instructor, admin) reach course material; otherwise, or if the AI service fails, a plain answer marked `grounded: false` |
| `ai-service/src/chunker.js` | One overview chunk per course + lecture windows (1200 chars, 200 overlap) prefixed with `Course > Section > Lecture`; stable UUIDv5 ids |
| `ai-service/src/indexer.js` | Delete the course's points, upsert fresh ones; drops courses that are no longer published |
| `ai-service/src/qdrant.js` | Collection (768-d, cosine), keyword payload index on `courseId`, filtered search |
| `ai-service/src/rag.js` | Prompt with numbered excerpts, citation extraction, renumbering to the UI's source list, "not covered" fallback |
| `ai-service/src/consumer.js` | RabbitMQ consumer with retry queues (5 s / 30 s / 120 s) and a DLQ; idempotent because re-indexing is a full replace |
| `ai-service/scripts/reindexAll.js` | `npm run reindex`: rebuild everything (first setup, settings change, missed events) |
| `ai-service/scripts/evalRetrieval.js` | `npm run eval`: retrieval hit-rate and off-topic rejection per threshold over `eval/golden.json` |

## Design decisions

- **Per-course filter, not per-course collections.** One collection with a `courseId` payload index keeps
  operations simple; the filter guarantees a student never retrieves another course's material.
- **Access is checked in the API, not the AI service.** The AI service trusts the API (shared token, private
  network) and only receives a `courseId` the API already authorised. Transcripts are never sent to browsers
  through public endpoints (`getCourseDetails` excludes them).
- **Asymmetric embeddings.** Chunks are embedded as `RETRIEVAL_DOCUMENT`, questions as `RETRIEVAL_QUERY`.
- **Full replace on change.** Re-indexing a course deletes and rewrites its points, so a removed lecture
  cannot linger and a redelivered event is harmless.
- **Content events are recorded after the response, outside the transaction.** They only trigger a refresh of
  derived data; `npm run reindex` repairs anything missed. Business events (payments) use the transactional
  outbox described in `MESSAGING.md`.
- **Graceful degradation.** If the AI service is down, the breaker opens and students get the plain answer
  instead of an error.

## Retrieval evaluation

`npm run eval` against the seeded demo catalog (12 answerable questions, 3 off-topic, `TOP_K=6`):

| MIN_SCORE | hit@6 | off-topic rejected |
|---|---|---|
| 0.50 | 12/12 | 2/3 |
| 0.55 | 12/12 | 3/3 |
| **0.60** | **12/12** | **3/3** |
| 0.65 | 10/12 | 3/3 |
| 0.70 | 2/12 | 3/3 |

The expected lecture was the top result for every answerable question. The weakest correct match scored
0.620 and the strongest off-topic match 0.547, so 0.60 sits in the gap. Re-run the eval when the embedding
model, chunk size or catalog changes.

## Running it

```bash
cp ai-service/.env.example ai-service/.env    # same INTERNAL_API_TOKEN as server/.env
cd ai-service && npm install && npm start      # or: docker compose --profile ai up -d --build
npm run reindex                                # first time
npm run eval
```

The API needs `AI_SERVICE_URL` and `INTERNAL_API_TOKEN` in `server/.env`; without them the chatbot keeps the
plain answer path. `npm run seed:demo` in `server/` adds short lecture transcripts so the demo courses have
material to retrieve.
