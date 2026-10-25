# Course search (Phase 6)

MongoDB search used `$text` for whole words and a case-insensitive regex for everything else: no typo
tolerance, no ranking beyond text score, no facets, and a regex that scans every course. Search now runs on
Elasticsearch, with MongoDB kept as an automatic fallback.

```
course edited / approved / archived ─┐
review created ──────────────────────┼─▶ outbox ─▶ RabbitMQ ─▶ worker "search-indexer"
order paid (popularity) ─────────────┘                          │ re-reads the course from MongoDB
                                                                ▼
POST /course/searchCourses ─▶ Elasticsearch alias "courses" ─▶ courses_<timestamp>
GET  /course/suggest      ─┘      │ fails or not configured
                                  ▼
                           MongoDB search (same response shape, engine: "mongo")
```

## Index design (`server/search/courseIndex.js`)

- **Alias + versioned indexes.** The app only knows the alias `courses`. `npm run search:reindex` builds a
  new `courses_<timestamp>` index, bulk-loads it, then swaps the alias in one atomic `_aliases` call and drops
  the old index: mapping changes need no downtime and searches never hit a half-built index.
- **Strict mapping**, so a typo in a field name fails loudly instead of creating a new field.
- **Analyzers:**
  - `english_folded` (stemming, stop words, accents removed): "functions" matches "function".
  - `courseName.autocomplete` with edge n-grams (2 to 20) at index time and a plain analyzer at query time:
    "jav" matches "JavaScript", but "react" does not match words starting "re".
  - `courseName.plain` (unstemmed) for spelling suggestions.
- **Denormalized document.** Instructor name, category, lecture titles, average rating, review count and
  student count are copied in, so a search is one request with no joins.

## Query (`server/search/courseSearch.js`)

- `multi_match` with field boosts: title ×5, tags ×3, instructor ×2, lecture titles ×1.5, then what you
  will learn and the description. Fuzziness `AUTO` (typos), a phrase boost on the title, and the
  autocomplete subfield for partial words.
- `function_score` adds a little popularity (log of enrollments) and rating, so between equally relevant
  courses the better ones rank first, without letting a popular course win an irrelevant query.
- **Facets** (categories, price bands, ratings) come from aggregations over the query, and the filters are
  applied as a `post_filter`. So the category list shows how many results each category would give,
  instead of collapsing to the currently selected one.
- "Did you mean" from a term suggester, only when nothing matched.
- **Highlighting** only the title, with a plain `highlight_query`. Highlighting with the fuzzy query was
  ~300 ms of a ~310 ms query on 9k courses (see PERFORMANCE.md).

## Keeping the index current

The `search-indexer` consumer listens to `course.content_changed`, `review.created` and `order.paid`. For
every course id in the event it re-reads MongoDB and replaces the document (or deletes it if the course is no
longer published). Because it always writes current state, redelivered or out-of-order events are harmless.
If events were ever lost, `npm run search:reindex` rebuilds everything from MongoDB, the source of truth.

## Failure behaviour

Search calls go through a circuit breaker. If Elasticsearch is down or slow, the request falls back to the
MongoDB query, and after repeated failures the breaker opens so requests skip the dead dependency. The
response's `engine` field and the `learnify_search_requests_total{engine}` metric show which engine answered.

## MongoDB query review

The same phase reviewed the hot MongoDB queries with `explain()` and added compound and covering indexes.
List endpoints with deep pages now use keyset (cursor) pagination: the catalog, notifications, the audit log
and webhook deliveries. Results are in PERFORMANCE.md.

## Commands

```
npm run search:reindex     rebuild the index and swap the alias
npm run perf:explain       explain() before/after the indexes on synthetic data
ES_TEST_URL=http://127.0.0.1:9200 npx jest tests/search.test.js    integration test against real Elasticsearch
```
