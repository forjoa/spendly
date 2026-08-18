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
  Axiom's `/v1/datasets/<dataset>/_ingest` endpoint. Buffers per request,
  flushes at request completion. No-op when unconfigured (local dev). Token
  read from env at ingest time; never placed in a log event or body.
- `src/app/api/_lib/api-handler.ts` — `withApiLogging()` wrapper that
  establishes the request context, emits the bookend received/completed
  events, catches uncaught errors, and flushes Axiom.
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
3. Read `transaction.body.parsed` for the same `requestId` to see exactly
   which fields Apple Wallet sent, their types, and lengths.
4. Read `transaction.validation.failed` to see which Zod issue fired, on
   which path, with expected/received types.
5. The client still receives the sanitized 422; Axiom holds the full context.

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
