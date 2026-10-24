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
