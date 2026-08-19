# Observability

Production observability for Spendly's transaction ingestion flow. The goal is
to answer, with certainty:

> What did `POST /api/transactions` receive during a real purchase, and where
> exactly did it fail?

## Architecture

```
request
  └─ withApiLogging()              establishes requestId + LogContext
      ├─ transaction.request.received
      ├─ authenticateApiKey()      auth.success / auth.failure
      ├─ transaction.body.parsed   (field presence/types, no values)
      ├─ Zod safeParse             transaction.validation.failed (full issues)
      ├─ ingest()                  transaction.ingest.started / .persisted / .failed
      │   └─ Notion adapter        notion.delivery.started / .succeeded / .failed
      └─ transaction.request.completed (statusCode, durationMs)
```

Every event carries the same `requestId`, so a single request is fully
correlatable end-to-end.

### Components

- `src/lib/logger.ts` — structured JSON logger. Request-scoped context via
  `AsyncLocalStorage` (`node:async_hooks`). Secret redaction for known
  sensitive keys (authorization, token, secret, password, cookie, session,
  credential, databaseUrl, encryptionKey, ...) and for known secret string
  shapes (`sk_live_...`, `ntn_...`, `Bearer ...`, legacy `secret_...`).
  Circular-reference safe. Fail-safe: a throwing sink is dropped, never
  breaks the request.
- `src/infrastructure/observability/axiom-sink.ts` — batched NDJSON POST to
  Axiom's `/v1/datasets/<dataset>/ingest` endpoint. Buffers per request,
  flushes at request completion. No-op when unconfigured (local dev). Token
  read from env at ingest time; never placed in a log event or body.
- `src/infrastructure/observability/db-sink.ts` — PostgreSQL sink that
  persists every event to the `application_log` table for the authenticated
  `/logs` view. Buffers per request (keyed by requestId); at flush time the
  authenticated `userId` (attached to the log context after
  `authenticateApiKey()` via `attachLogContext()`) is backfilled onto the
  request's pre-auth events, so a full operation is queryable per user.
  Events from requests that never authenticate keep `userId = null` and stay
  Axiom-only. Fail-safe: a database failure is reported to the console only
  and never breaks the request.
- `src/app/api/_lib/api-handler.ts` — `withApiLogging()` wrapper that
  establishes the request context, emits the bookend received/completed
  events, catches uncaught errors, and flushes both sinks (Axiom + Postgres).
- `src/app/api/_lib/body-inspect.ts` — `summarizeBody()` produces a safe
  field presence/type/length map (no values) so we can see what Apple Wallet
  sent without exposing PII or secrets.

## Request ID

The `requestId` is resolved in this order:

1. The `x-request-id` request header (if present) — useful for upstream
   proxies or explicit tracing.
2. Vercel's `x-vercel-id` header.
3. A freshly generated `crypto.randomUUID()`.

Every log event for a request shares this id. To find a complete request in
Axiom:

```
requestId = "<the id>"
```

## Events

| Event | When | Key fields |
| --- | --- | --- |
| `transaction.request.received` | request enters the wrapper | method, path, userAgent, contentType |
| `transaction.auth.success` | API key validated | userId, keyId |
| `transaction.auth.failure` | API key missing/bad/not found | reason (missing-header \| bad-format \| not-found) |
| `transaction.body.parsed` | after JSON parse | bodyType, itemCount, fields (presence/type/length), extraFields |
| `transaction.validation.failed` | Zod `safeParse` failure | schema, issues[] (code, path, message, expected, received) |
| `transaction.ingest.started` | before persist | userId, externalId |
| `transaction.persisted` | after DB insert | transactionId, replay |
| `transaction.ingest.failed` | ingest threw | errorCode, errorType, stack (unknown errors only) |
| `notion.delivery.started` | before Notion call | transactionId, provider |
| `notion.delivery.succeeded` | Notion page created | transactionId, provider, durationMs, httpStatus |
| `notion.delivery.failed` | Notion call failed | transactionId, provider, durationMs, httpStatus, error (sanitized) |
| `transaction.request.completed` | response sent | statusCode, durationMs |
| `transaction.request.uncaught` | handler threw unexpectedly | errorType, message, stack |

## Debugging a real Apple Wallet 422

1. Make a real purchase that triggers the iOS Shortcut.
2. In Axiom, filter the Spendly dataset by `event == "transaction.validation.failed"`
   (or by the `requestId` from `transaction.request.completed` with `statusCode == 422`).
   Alternatively, open `/logs` and filter by `transaction.validation.failed`.
3. Read `transaction.body.parsed` for the same `requestId` to see exactly
   which fields Apple Wallet sent, their types, and lengths.
4. Read `transaction.validation.failed` to see which Zod issue fired, on
   which path, with expected/received types.
5. The client still receives the sanitized 422; Axiom and `application_log`
   hold the full context.

## The /logs view (PostgreSQL sink)

The same events are also persisted to the `application_log` table and are
visible to the authenticated user at `/logs`:

- Every query is scoped by the session's `userId`; a user can never see
  another user's logs.
- Events emitted after authentication carry `userId` via the log context;
  the db sink backfills it onto the request's pre-auth events
  (`transaction.request.received`, `transaction.body.parsed`) at flush time,
  so a full operation is reconstructable by `requestId` + `userId` +
  `transactionId`.
- Events from requests that never authenticate keep `userId = null` and are
  visible only in Axiom (they appear in no user's /logs view).
- Filters: level, event, request id, UTC time range; paginated (25/page).
  Selecting a log shows timestamp, request id, transaction id, message and
  the redacted metadata as JSON.

Schema: see DATABASE.md (`ApplicationLog`).

## What is deliberately NOT logged

- API keys (`sk_live_...`), the `Authorization` header, Bearer tokens
- Notion integration tokens (`ntn_...`)
- `BETTER_AUTH_SECRET`, `SPENDLY_ENCRYPTION_KEY`, `DATABASE_URL`
- Cookies, sessions, passwords, raw credentials, credential hashes
- Full request body values (only field presence/type/length)
- Raw internal stack traces in HTTP responses (stacks go to Axiom/Vercel only,
  never to the client)

Redaction is defense-in-depth: both key-name matching and secret-shape
scrubbing, so a secret embedded in an unexpected field is still scrubbed.

## Axiom configuration

Axiom is optional. Without configuration, logs still emit to `console`
(stderr JSON lines), which Vercel captures for short-term retention.

To enable Axiom (free tier is sufficient for debugging):

1. Create an Axiom account at https://axiom.co.
2. Create a dataset (e.g. `spendly-prod`).
3. Create an API token with **Ingest** permission on that dataset
   (Settings → API Tokens).
4. Set these environment variables in Vercel (Production environment):
   - `AXIOM_DATASET` — the dataset name (e.g. `spendly-prod`)
   - `AXIOM_TOKEN` — the API token (server-only, never prefixed with `NEXT_PUBLIC_`)
   - `AXIOM_URL` — optional; defaults to `https://api.axiom.co`

The sink is disabled automatically when `AXIOM_DATASET` or `AXIOM_TOKEN` is
absent, so local development and preview deployments that lack the vars simply
fall back to console logging.
