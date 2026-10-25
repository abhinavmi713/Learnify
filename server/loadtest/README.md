# Load tests

Results and what they taught: [docs/PERFORMANCE.md](../../docs/PERFORMANCE.md).

## 1. Seed a separate load database

```bash
node loadtest/seedLoadData.js 10000
```

Creates `<your database>_load` (your real data is untouched) with 10,000 courses and 30,000 reviews, and, if
`ELASTICSEARCH_URL` is set, builds the `courses_load` search index.

## 2. Start the API against it

Rate limiters off (`NODE_ENV=test`). RabbitMQ and Redis are disabled so the load instance does not share
queues or cache keys with your normal dev API:

```bash
MONGODB_URL="mongodb://127.0.0.1:27018/learnify_load?directConnection=true" ELASTICSEARCH_INDEX=courses_load NODE_ENV=test PORT=4010 RABBITMQ_URL= REDIS_URL= node index.js
```

Add `ELASTICSEARCH_URL=` (and another `PORT`) for an instance that searches with MongoDB instead.

## 3. Run k6 (Docker, no install needed)

```bash
docker run --rm -v "$PWD/loadtest/k6:/scripts" -e BASE=http://host.docker.internal:4010 grafana/k6:0.54.0 run /scripts/search.js
```

```bash
docker run --rm -v "$PWD/loadtest/k6:/scripts" -e BASE=http://host.docker.internal:4010 -e VUS=50 grafana/k6:0.54.0 run /scripts/journey.js
```

`VUS` and `DURATION` change the load. Both scripts have thresholds (p95 targets, error rate) and exit
non-zero when they are missed, so they can gate a pipeline.

`catalog.js` is the older autocannon benchmark for the Redis catalog cache (Phase 1).
