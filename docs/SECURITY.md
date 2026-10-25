# Security and data integrity (Phase 5)

## Sessions: short access tokens, rotating refresh tokens

Before: one JWT valid for 24 hours, also set as a cookie. A stolen token worked for a day.

Now:

| | Access token | Refresh token |
|---|---|---|
| Form | JWT (`jti`, `tokenVersion`, role) | 32 random bytes; only a SHA-256 hash is stored (`RefreshToken`) |
| Lifetime | 15 min (`ACCESS_TOKEN_TTL`) | 7 days, sliding (`REFRESH_TOKEN_TTL_DAYS`); a login lasts at most 30 days (`SESSION_MAX_DAYS`) |
| Where | `Authorization: Bearer` header only | httpOnly cookie, `Path=/api/v1/auth`, `SameSite=Lax` (dev) / `None; Secure` (prod) |
| Revocation | `jti` denylist in Redis on logout; `tokenVersion` bump on password change | per family in Mongo |

```
login ──▶ access token (body) + refresh cookie R1           family F
401 ──▶ POST /auth/refresh with R1 ──▶ R1 marked used, R2 issued in F, new access token
replay of R1 later ──▶ "reuse detected": every token in F revoked, audit entry, both parties log in again
```

- **Reuse detection.** A refresh token is single-use, claimed with an atomic `findOneAndUpdate({usedAt: null})`.
  Seeing a used token again means two parties hold it, so the whole family is revoked.
- **Two tabs refreshing at once** present the same token; a repeat within 10 s gets `409` instead of a
  revocation, and the client picks up the token the other tab stored (localStorage is shared).
- **CSRF.** The access token is never read from cookies, so ordinary routes cannot be forged cross-site.
  `/auth/refresh` and `/auth/logout` require `X-Requested-With`, which forces a CORS preflight other origins fail.
- **Client.** `src/services/apiConnector.js` retries a 401 once after a single shared refresh; if refreshing
  fails the user is logged out locally. The socket reads the latest token on every reconnect.
- **Users can see and end sessions** (Settings → Security): one row per family, "sign out" per device, and
  "sign out everywhere" (bumps `tokenVersion`, revokes all families).
- Password change/reset and admin deactivation revoke every session.

## Two-factor authentication (TOTP)

- RFC 6238 implemented in `utils/totp.js` (HMAC-SHA1, 6 digits, 30 s, ±1 step), verified against the RFC
  test vectors. Works with any authenticator app; setup shows a QR code and the key.
- Secrets are encrypted at rest with AES-256-GCM (`utils/secretBox.js`, `ENCRYPTION_KEY`) and live in a
  `select: false` field, so they never leave the server with a user document.
- Login becomes two steps: password → short-lived signed challenge (5 min) → code → session.
- A code is accepted once: the last used step is stored and updated with a conditional write, so two
  racing requests with the same code cannot both succeed.
- 8 single-use recovery codes, stored as hashes, shown once.
- Wrong codes count towards the same account lockout as wrong passwords. Disabling needs password + code.

## Authorization (RBAC)

`config/permissions.js` maps roles to permissions; routes ask for permissions
(`requirePermission("coupon:manage")`), so what a role may do is decided in one table. The role is read from
the database on every request, not from the token, so a demotion applies immediately. Missing permission is
`403` (we know who you are), missing/invalid login is `401`.

## Audit log

`AuditLog` is append-only: Mongoose hooks reject updates and deletes. Entries record action, outcome, actor
(id, role, email), target, metadata, IP, user agent and request id.

Recorded: logins (success/failure, reason, lockout), 2FA enable/disable/failed codes, recovery-code use,
refresh-token reuse, password change/reset, session revocation, sign-out-everywhere, course
approve/reject/restore, user activation, coupon and category changes.

Admins read it at Dashboard → Audit Log, filtered by action, outcome or user, with keyset (cursor) pagination
(`?before=<id>`), which stays fast at any depth and does not shift when new rows arrive.

## Idempotency keys

`middleware/idempotency.js` (Stripe-style), backed by Redis with an in-process fallback:

| Request | Result |
|---|---|
| first with a key | runs; response stored 24 h |
| same key, same body | stored response replayed (`Idempotent-Replayed: true`), handler not run |
| same key while the first is running | `409`, retry shortly |
| same key, different body | `422` |
| first one failed with 5xx | not stored; a retry runs again |

Applied to checkout (`capturePayment`), payment verification, coupon creation and course creation. The
client derives the key from what is submitted (cart + coupon, or the payment id), so a double click, a retry
or a second tab produce the same key.

Payment and enrollment writes already run in Mongo transactions with the outbox (`MESSAGING.md`).

## Configuration

```
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
SESSION_MAX_DAYS=30
ENCRYPTION_KEY=<64 hex chars>   # required to turn on 2FA; keep it stable
```
