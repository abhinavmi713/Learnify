# Deploying Learnify

A working production setup using managed services with free or low-cost tiers. The order matters: data
services first, then the backend, then the frontend, then the integrations that need public URLs.

```
app.yourdomain.com  ─▶ Vercel (React build)
api.yourdomain.com  ─▶ Render web service  (API + Socket.IO)
                       Render worker       (RabbitMQ consumers, outbox relay)
                       Render web service  (AI service)
MongoDB Atlas · Upstash Redis · CloudAMQP · Elasticsearch (optional) · Qdrant Cloud (optional)
```

## 0. Before you start

1. **Rotate every secret that was ever committed** (Razorpay, Cloudinary, the Gmail app password, the JWT
   secret, any database password). Use only new values below.
2. **Buy or reuse a domain.** Serving the app and API from subdomains of one domain
   (`app.` and `api.yourdomain.com`) keeps the refresh-token cookie first-party. If the frontend is on
   `*.vercel.app` and the API on `*.onrender.com`, the cookie is third-party, and Safari and Firefox block
   it: users would be logged out every 15 minutes.
3. **Generate secrets** (run once per value):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   You need `JWT_SECRET`, `INTERNAL_API_TOKEN` (24+ characters) and `ENCRYPTION_KEY`, which must be
   exactly 64 hex characters (`randomBytes(32)`).

## 1. Data services

| Service | Provider (free tier) | What to copy |
|---|---|---|
| MongoDB | [MongoDB Atlas](https://www.mongodb.com/atlas), M0 cluster | Connection string `mongodb+srv://user:pass@cluster/learnify`. Atlas clusters are replica sets, so transactions work. Under Network Access, allow your hosts (or `0.0.0.0/0` with a strong password). |
| Redis | [Upstash](https://upstash.com) | `rediss://default:<password>@<host>:6379` (TLS). |
| RabbitMQ | [CloudAMQP](https://www.cloudamqp.com), "Little Lemur" | `amqps://user:pass@host/vhost`. |
| Search (optional) | Elastic Cloud, or Elasticsearch 8 on any small VM | URL plus `ELASTICSEARCH_API_KEY`, or credentials in the URL. Leave unset to use MongoDB search. |
| Vectors (optional) | [Qdrant Cloud](https://cloud.qdrant.io), 1 GB free cluster | Cluster URL and API key. Needed only for the AI assistant. |

Every optional service can be added later: the app keeps working without it.

## 2. Third-party accounts

- **Razorpay:** start with test-mode keys. Switch to live keys only after KYC and a full test purchase.
- **Cloudinary:** cloud name, API key and secret. Uploads go to the `Learnify` folder.
- **Email (SMTP):** a transactional provider (Resend, Brevo, Amazon SES) or a Gmail app password. Set
  `MAIL_FROM` to a sender on a domain you verified with the provider (SPF/DKIM), or mail lands in spam.
- **Gemini:** a dedicated API key for this project, with a spending limit in Google Cloud.
- **Sentry (optional):** a Node project's DSN for error tracking.

## 3. Backend on Render

1. Push the repository to GitHub. CI must be green.
2. In Render: **New → Blueprint**, pick the repository. `render.yaml` creates three services:
   - `learnify-api` (web)
   - `learnify-worker` (background worker; needs a paid instance type)
   - `learnify-ai` (web)
3. Fill in the values Render asks for:
   - `CLIENT_URL` = `https://app.yourdomain.com` (comma-separate several origins)
   - `MONGODB_URL`, `REDIS_URL`, `RABBITMQ_URL`, and optionally `ELASTICSEARCH_URL` / `ELASTICSEARCH_API_KEY`
   - `ENCRYPTION_KEY`, `INTERNAL_API_TOKEN` (the same value in `learnify-ai`)
   - mail, Razorpay, Cloudinary and Gemini keys; optionally `SENTRY_DSN`
   - for `learnify-ai`: `QDRANT_URL`, `QDRANT_API_KEY`, `RABBITMQ_URL`, `GEMINI_API_KEY`, and
     `API_INTERNAL_URL` = `https://api.yourdomain.com/api/v1/internal`
4. Deploy. The API's health check is `/health`. It should report `mongo: up` and the other dependencies you
   configured.
5. **Custom domain:** in `learnify-api` → Settings → Custom Domains, add `api.yourdomain.com` and create
   the CNAME record Render shows.

Notes:
- `NODE_ENV=production` turns on the production rules: a strong `JWT_SECRET` is required, `CLIENT_URL` must
  be set, the refresh cookie is `Secure; SameSite=None`, `/metrics` needs `METRICS_TOKEN`, webhooks must be
  https and may not point to private addresses, and the demo seed refuses to run.
- `TRUST_PROXY=1` makes rate limits and audit entries see real client IPs behind Render's proxy.
- Socket.IO works on Render web services (WebSockets are supported). With more than one API instance,
  Redis must be configured so instances share sockets.
- Free Render web services sleep after inactivity; the first request then takes ~30 s. Use a paid instance
  for anything you demo live.

**Alternatives.** The same Docker images run on Railway, Fly.io or any VM with Docker. CI publishes them to
`ghcr.io/<owner>/learnify-api` and `learnify-ai-service` on every push to `main`. The worker is the API image
started with `node workers/index.js`.

## 4. One-time data setup

From your machine, with `server/.env` pointing at the production database (or from a Render shell):

```bash
cd server
ADMIN_EMAIL=you@yourdomain.com ADMIN_PASSWORD='<long password>' ADMIN_FIRST_NAME=You ADMIN_LAST_NAME=Admin npm run create-admin
npm run search:reindex                       # only if Elasticsearch is configured
```

```bash
cd ai-service && npm run reindex             # only if the AI service is configured
```

Then sign in as that admin, create categories, and turn on two-factor authentication (Settings →
Security). Do not run `seed:demo` against production.

## 5. Frontend on Vercel

1. **New Project** → import the repository. Root directory: the repository root. `vercel.json` sets the
   build command, output folder and client-side routing.
2. Environment variables (baked in at build time):
   - `REACT_APP_BASE_URL` = `https://api.yourdomain.com`
   - `REACT_APP_RAZORPAY_KEY` = the Razorpay **key id** (public; never the secret)
3. Deploy, then add the domain `app.yourdomain.com` under Settings → Domains.
4. Check that `CLIENT_URL` on the API matches this origin exactly (scheme, no trailing slash).

## 6. Integrations that need public URLs

- **Razorpay webhook:** Dashboard → Webhooks → add `https://api.yourdomain.com/api/v1/payment/webhook`
  for `payment.captured`, and put its secret in `RAZORPAY_WEBHOOK_SECRET`. Without it, a student who pays and
  closes the tab before returning is charged but not enrolled.
- **Cloudinary:** nothing to configure; uploads are signed by the API.

## 7. Monitoring in production

- **Errors:** set `SENTRY_DSN`.
- **Metrics:** Grafana Cloud (free tier). Run Grafana Alloy or Prometheus to scrape
  `https://api.yourdomain.com/metrics` with the bearer token `METRICS_TOKEN`, and import
  `observability/grafana/dashboards/learnify-overview.json` and `observability/alerts.yml`.
  CloudAMQP exposes RabbitMQ metrics through its own integrations.
- **Traces:** set `OTEL_EXPORTER_OTLP_ENDPOINT` (and `OTEL_EXPORTER_OTLP_HEADERS` for the provider's auth)
  to a hosted OTLP endpoint such as Grafana Cloud Traces or Honeycomb.
- **Uptime:** point an uptime checker at `https://api.yourdomain.com/health`.
- **Backups:** Atlas has automatic backups on paid tiers. On M0, schedule `npm run backup` from a machine you
  control.

## 8. Go-live checklist

- [ ] `/health` returns `ok` with every configured dependency `up`
- [ ] Sign up a new account and receive the OTP email (check spam placement)
- [ ] Log in, wait 15 minutes, use the app: the session refreshes silently
- [ ] Test-mode purchase end to end; enrollment and the email arrive; repeat with the tab closed right after paying (webhook path)
- [ ] Upload a lecture video as an instructor; it plays for an enrolled student
- [ ] Live Q&A on a lecture updates in a second browser without refresh
- [ ] Search finds a course with a typo (or answers from MongoDB if Elasticsearch is off)
- [ ] AI assistant answers with citations for an enrolled student
- [ ] Admin: approve a course, see it in the audit log
- [ ] Turn on 2FA for the admin account
- [ ] `https://api.yourdomain.com/api/docs` is reachable (or block it at the proxy if you prefer it private)
- [ ] Switch Razorpay to live keys and do one real low-value purchase and refund

## Approximate monthly cost

| | Free-tier setup | Small production |
|---|---|---|
| Vercel | $0 | $0–20 |
| Render (API, worker, AI) | API and AI free (they sleep); the worker needs a paid instance (~$7) | 3 × ~$7 |
| Atlas, Upstash, CloudAMQP, Qdrant | $0 | ~$10–60 depending on Atlas tier |
| Elasticsearch | skip (MongoDB search) | VM ~$10–20, or Elastic Cloud |
| Gemini | usage-based | usage-based, cap it |
