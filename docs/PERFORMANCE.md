# Performance notes

Numbers are from a developer laptop (Windows, 16 GB, MongoDB and Redis in Docker), single API process,
so read them as relative, not absolute. Reproduce with `server/loadtest/catalog.js` (see the header of that
file for how to start the instances).

## Phase 1 — catalog caching with Redis

`GET /api/v1/course/getAllCourses`, 50 concurrent connections, 10 seconds, rate limiters off (`NODE_ENV=test`).

| Strategy | Requests/s | Avg latency | p50 | p99 |
|---|---:|---:|---:|---:|
| No cache (every request unique, full MongoDB query) | 141 | 352 ms | 299 ms | 757 ms |
| Redis cache (shared across instances) | 1207 | 41 ms | 38 ms | 84 ms |
| In-process cache (not shared) | 1495 | 33 ms | 29 ms | 94 ms |

- Caching gives about **8.5x the throughput** and **8.6x lower average latency** than hitting MongoDB.
- The in-process cache is ~24% faster than Redis because it avoids a network hop, but each API instance
  keeps its own copy, so after a catalog change instances disagree until their TTL expires and the hit
  ratio drops as you add instances. Redis trades a little latency for one shared, consistently-invalidated cache.

## Behaviour verified against real Redis (two API instances on :4000 and :4001)

- A response cached by instance A is a HIT on instance B.
- Invalidation is one `INCR` of `cache:catalog:ver`; both instances stop serving the old entry.
- Login attempts for one account are limited by a shared token bucket: 8 wrong attempts alternating between
  the two instances are accepted, the 9th gets `429` whichever instance receives it.
- Logging out puts the token's `jti` on a Redis denylist (TTL = remaining token life); reusing the token returns 401.
- With Redis stopped, `/health` reports `redis: down` but stays `ok`; login and the catalog keep working
  (cache and limits fall back to per-process); when Redis returns it reconnects by itself.

## Phase 6: query indexes, measured with explain()

`npm run perf:explain` seeds a throwaway database (20k courses, 200k progress rows, 200k notifications, 50k
payments), runs the app's hot queries with `explain("executionStats")`, adds the indexes, and runs them again.

| Query | Before | After |
|---|---|---|
| catalog: published, newest first | `SORT>COLLSCAN` 20,000 docs, 10 ms | `IXSCAN` 24 docs, 0 ms |
| moderation queue: pending, newest first | `SORT>COLLSCAN` 20,000 docs, 8 ms | `IXSCAN` 50 docs, 0 ms |
| instructor's courses | `COLLSCAN` 20,000 docs, 8 ms | `IXSCAN` 64 docs, 0 ms |
| student's progress (profile stats) | `COLLSCAN` 200,000 docs, 64 ms | `IXSCAN` 12 docs, 2 ms |
| notification feed | `SORT` in memory | `IXSCAN`, no sort |
| revenue: collected payments | `COLLSCAN` 50,000 docs, 24 ms | `PROJECTION_COVERED`, **0 docs read**, 16 ms |

What the numbers taught:

- **Equality, Sort, Range.** `{status, deletedAt, createdAt}` still sorted the moderation queue in memory
  (deletedAt is not constrained there, so it breaks the sort order). `{status, createdAt, deletedAt}` serves
  both the catalog and the moderation queue with one index.
- **A prefix matters.** Profile stats query `CourseProgress` by `userId`, but the existing unique index
  starts with `courseID`, so every request scanned all 200k rows.
- **Low-selectivity indexes can be slower than a scan.** An index on payment `status` (60% of rows match)
  took 49-79 ms against 24 ms for the scan: it fetched 30k documents one by one. A **covering** index
  `{status, createdAt, amount}` with a projection that excludes `_id` reads no documents at all.
- **`$in: [x, null]` defeats covering.** An index cannot tell `null` from a missing field, so MongoDB must
  fetch every document. Payments always have a status (default `fulfilled`), so the filter became plain
  equality.

## Phase 6/7: load tests with k6 (search and a user journey)

Data: 10,000 courses (8,961 published) and 30,000 reviews in a separate `_load` database
(`node loadtest/seedLoadData.js`), indexed into its own Elasticsearch alias. API with `NODE_ENV=test` (rate
limiters off), in-process cache and event bus. k6 runs in Docker on the same laptop. See `server/loadtest/README.md`.

### Search: Elasticsearch vs the MongoDB fallback (`k6/search.js`, 30 virtual users)

| | Search p95 | Search avg | Suggest p95 | Requests/s |
|---|---:|---:|---:|---:|
| MongoDB (`$text`/regex + `$lookup` ratings) | 4.33 s | 803 ms | 48 ms | 51 |
| Elasticsearch, first version | 1.75 s | 779 ms | 216 ms | 48 |
| Elasticsearch, title-only plain highlighting | **76 ms** | **36 ms** | **48 ms** | **200** |

Relevance differs too: the typo `dockr` finds 331 Docker courses on Elasticsearch and none on MongoDB.

The first Elasticsearch version was barely faster than MongoDB. Its own `took` time showed the cost was in
Elasticsearch (325 ms for "javascript", 7 ms for "node"); removing features one at a time pointed at
**highlighting**: re-using the fuzzy query for highlighting made the highlighter expand every fuzzy term
against the index. Highlighting only the title with a plain `highlight_query` cut the query to ~10 ms.

### Visitor journey (`k6/journey.js`, 50 virtual users: catalog, type-ahead, search, course page)

| | p95 (all requests) | Catalog p95 | Catalog response | Failed | Journeys/s |
|---|---:|---:|---:|---:|---:|
| Catalog returned every course | 8.27 s | 10.4 s | 3.5 MB | 0.24% | 3.0 |
| Catalog paginated (24 per page, keyset cursor) | **25 ms** | **6.5 ms** | **8 KB** | 0% | 8.4 (think-time bound) |

`getAllCourses` returned the whole catalog. With a handful of demo courses nobody noticed; at 9k courses it
was a 3.5 MB response that saturated the server even when served from cache. It now returns one page and a
total (the home page shows 4 courses and the count).
