# Spendly — Agent Instructions

This file is the entry point for any AI coding agent working on Spendly. Read it before making changes.

## What Spendly is

Spendly is a SaaS for automatic personal expense tracking. A payment happens, Spendly receives and normalizes the transaction, then delivers it to a tool the user already uses.

V0 loop: `Apple Wallet → iOS Shortcut → Spendly API → Notion`. Notion is the first destination integration, not the product. The product is the transaction engine and the orchestration layer between sources and destinations.

## Authoritative documentation

Read these before touching code. They outrank your assumptions.

- `AI_CONTEXT.md` — highest-level product/engineering spec and AI rules. Treat as canonical.
- `ARCHITECTURE.md` — modular monolith layout and integration principle.
- `DATABASE.md` — entity model, money representation, idempotency. Authoritative for data.
- `INTEGRATIONS.md` — source→transaction→destination adapter design and Notion V0 flow.
- `SECURITY.md` — secrets, auth, API, transactions, privacy rules.
- `ROADMAP.md` — V0–V5 scope. Do not build future versions unless asked.
- `README.md` — public overview.

When documentation and code disagree, fix the one that is wrong, then update the other. Do not silently let them drift.

## Architecture rules

Spendly is a modular monolith. Layering:

```
app  →  domain  →  infrastructure / integrations
```

- `src/app` — Next.js routes, pages, API endpoints. Framework lives here.
- `src/components` — UI components.
- `src/domain` — core business logic. Must NOT import Next.js, React, Drizzle, Postgres, Notion SDK, or browser APIs. Pure types and functions where possible.
- `src/infrastructure` — database (`db`), authentication (`auth`). Implements interfaces the domain defines.
- `src/integrations` — external service adapters (e.g. `notion`). One folder per integration.
- `src/lib` — shared technical utilities (money, crypto, errors, utils).

Never put business logic inside React components. Never let the domain depend on a specific integration or framework. Adding a destination must not require changing the transaction domain.

Dependency injection at boundaries. Prefer small modules, explicit names, strong types, deterministic behaviour.

Do NOT introduce microservices, queues, Redis, workers, Kafka, event buses, generic plugin systems, or enterprise abstractions. Async delivery is explicitly deferred to V1.

## Security rules

- Never expose secrets, tokens, or credentials to the client.
- Never commit secrets to git. Use `.env` (gitignored) and `.env.example` (names only).
- Never log API keys, OAuth tokens, Notion tokens, raw decrypted credentials, or their hashes.
- Never trust user IDs supplied by clients. Derive ownership from the authenticated session.
- API keys are hashed at rest; the raw value is shown once at creation and never again.
- Integration tokens are encrypted with AES-256-GCM using `SPENDLY_ENCRYPTION_KEY` (server-only). The crypto module must never be imported into client components.
- Validate all external input. Never return raw internal stack traces or credentials in API responses.

## Money representation rules

Money is stored and passed as **integer minor units** (e.g. EUR 10.50 → `1050`). Never use floating-point for persisted monetary values. Store `currency` as a separate ISO 4217 code. Respect per-currency decimal exponents (JPY/KRW/CLP/ISK → 0; BHD/KWD/OMR/TND → 3; others → 2). Use `src/lib/money.ts`. Do not implement currency conversion or FX.

## Testing requirements

Test business logic, not snapshots. Prioritize: money, crypto, transaction validation, idempotency, delivery states, API authentication. Use real code paths; mocks only at external boundaries (e.g. Notion HTTP). Run `npm test` before considering work done.

## Build / typecheck / lint

- `npm run typecheck` — must pass.
- `npm run build` — must pass (production build).
- `npm run lint` — must pass with zero warnings.
- `npm test` — must pass.

Do not leave the repository knowingly broken. Fix problems immediately.

## Commands

- `npm run dev` — local server (requires `.env`).
- `npm run db:generate` / `npm run db:migrate` / `npm run db:push` — Drizzle migrations.

## What agents MUST NOT do

- Do not build features from future roadmap versions (V1+) unless explicitly requested.
- Do not introduce new dependencies without a concrete reason.
- Do not replace working code unnecessarily.
- Do not invent product requirements that contradict the docs.
- Do not expose secrets or disable security controls to make development easier.
- Do not commit `.env`, `node_modules`, build artifacts, or temporary files.
- Do not fake production behavior. Implement real integrations; use mocks/fakes only in tests at boundaries.
- Do not put business logic in React components or let the domain depend on frameworks/integrations.

## How to approach changes

1. Read `AI_CONTEXT.md` and the relevant domain doc.
2. Inspect the existing code you will touch.
3. Make the smallest correct change.
4. Preserve the architecture and naming.
5. Add or update tests for changed business logic.
6. Run typecheck, build, lint, and tests.
7. Update documentation if an architectural decision changed.

If you encounter an ambiguity not resolved by the docs, choose the smallest coherent implementation and document the decision in the relevant `.md` file or a code comment.

## Current implementation state (2026-08)

Progress against ROADMAP.md phases:

- Foundation (project setup, design system, UI shell): done and committed.
- Database layer (Drizzle schema + client): done. First migration generated at `drizzle/0000_familiar_zaran.sql`. Six tables: `user`, `session`, `transaction`, `transaction_delivery`, `connection`, `api_key`. Money is integer minor units; idempotency enforced by unique indexes on `(user_id, external_id)` and `(transaction_id, provider)`.
- Auth (Better Auth, email/password): scaffolded. Server instance `src/infrastructure/auth/auth.ts` (`getAuth()`, lazy). Client `src/infrastructure/auth/auth-client.ts`. Route `src/app/api/auth/[...all]/route.ts`. Server session helpers in `src/infrastructure/auth/session.ts` (`getSession`, `requireUser`). DB client and auth instance are lazy so `next build` does not require live secrets.
- API-key auth: `src/infrastructure/auth/api-key.ts` authenticates ingestion requests via `Authorization: Bearer sk_live_...`. Keys hashed with SHA-256; raw keys never stored. Key generation/hashing utilities in `src/lib/keys.ts` (11 unit tests).
- Transaction domain: `src/domain/transaction/` — `schema.ts` (Zod), `repository.ts`, `delivery-repository.ts`, `service.ts` (`ingest`, `listTransactions`, `getTransaction`). `ingest` persists then delivers synchronously to enabled destinations; idempotent on replay.
- Connection domain: `src/domain/connection/` — `repository.ts` (namespace `connectionRepo`), `credentials.ts` (encrypt/decrypt JSON credential payloads).
- Notion adapter: `src/infrastructure/integrations/notion/adapter.ts` — creates a page in a Notion database per transaction; sanitizes errors; never exposes the token.
- Public API: `POST /api/transactions` (single or array up to 50) and `GET /api/transactions` in `src/app/api/transactions/route.ts`. API error helper in `src/app/api/_lib/errors.ts` maps `SpendlyError` subclasses to HTTP status without leaking internals.
- App UI (route groups): `(auth)` group for sign-in/sign-up (no shell, redirects if signed in); `(app)` group for the protected app (server layout checks session via `getSession()`, redirects to `/sign-in` otherwise, renders `AppShell`). Both layouts are `force-dynamic` because they depend on the session cookie.
- API-key management UI (`/api-keys`): server page lists keys (label, suffix, created, last-used, status) via `src/domain/api-key/service.ts`; client dialog (`create-key-dialog.tsx`) calls the `createApiKeyAction` server action and shows the raw key once with copy + warning; `revoke-key-button.tsx` calls `revokeApiKeyAction`.
- Connections UI (`/connections`): server page lists connections with provider label and enabled badge; client dialog (`create-connection-dialog.tsx`) collects Notion token + database id and calls `createNotionConnectionAction` (encrypts at rest); `delete-connection-button.tsx` calls `deleteConnectionAction`.
- Transactions list (`/transactions`): server page shows recent transactions with merchant, amount (integer minor units via `Amount`), date, source, and per-destination delivery status badges (`StatusBadge`). Uses `listTransactionsWithDeliveries` in the transaction service.
- Overview (`/overview`): dashboard cards (recent expense total, connection count, active API-key count) plus a recent-spending table and a get-started empty state when nothing is configured.
- Settings (`/settings`): account details (name, email, verified) and a client `SignOutButton` that calls `authClient.signOut`.
- Observability: structured JSON logger (`src/lib/logger.ts`) with request-scoped context via `AsyncLocalStorage`, secret redaction by key name and string shape, and two sinks: an optional Axiom sink (`src/infrastructure/observability/axiom-sink.ts`, NDJSON POST to `/v1/datasets/<dataset>/ingest`) for external retention, and a PostgreSQL sink (`src/infrastructure/observability/db-sink.ts`) that persists every event to the `application_log` table (migration `drizzle/0002_application_logs.sql`). The db sink buffers per request and backfills the authenticated `userId` (attached via `attachLogContext()` after `authenticateApiKey()`) onto pre-auth events at flush time. Both sinks are fail-safe and never break the request. The transaction ingestion flow is fully instrumented via `withApiLogging()` (`src/app/api/_lib/api-handler.ts`): every event from `transaction.request.received` through `transaction.request.completed` shares a `requestId`. Zod validation failures log full issues (`transaction.validation.failed`); Notion delivery emits `notion.delivery.started/succeeded/failed`. See `OBSERVABILITY.md` for the event catalog and Axiom setup.
- Logs UI (`/logs`): per-user application log explorer. PostgreSQL (`application_log`) is the source of truth; Axiom is a strictly secondary best-effort sink. Server page scopes every query by the session user id via `src/domain/log/service.ts` (`listApplicationLogs`); client `log-explorer.tsx` provides level/event/request-id/path/status-code filters, UTC time range, pagination (25/page), per-row status/duration, and expandable rows with redacted metadata. Domain: `src/domain/log/` (schema, repository, service). Every event carries method+path from the log context. The db sink flushes are awaited inside the request handler (serverless-safe); global-bucket events never inherit a flushing request's userId. Local dev without Neon: set `DATABASE_WS_PROXY` (see `.env.example`) to route the Neon driver through a local wsproxy in front of a plain PostgreSQL.

Not yet implemented (intentional, per V0 scope):

- Migrations 0000-0002 (including `application_log`) were applied manually to the production database.
- E2E test of the full Apple Wallet → Spendly → Notion loop against real services.
- Apple Wallet shortcut setup instructions are at `docs/apple-wallet-shortcut.md` and rendered at `/docs/apple-wallet-shortcut`. Test procedures are at `scripts/v0-test.sh` and `scripts/v0-failure-test.sh` (not yet executed against live infrastructure).
- Axiom dataset + token must be created manually and set as Vercel env vars (`AXIOM_DATASET`, `AXIOM_TOKEN`) for production log retention; without them the sink is a no-op and logs go to console only.

Checks (all green as of this writing): `npm run typecheck`, `npm run build` (13 routes including `/logs` and `/docs/apple-wallet-shortcut`), `npm run lint` (0 warnings), `npm test` (181 passed: money 19, crypto 7, keys 11, transaction schema 35 (including the `amountMinor` boundary contract: integer-valued JSON numbers accepted, fractional numbers rejected without rounding), error mapper 7, logger 13, body-inspect 6, axiom-sink 11, db-sink 13, log service 12, route observability 11, api-key auth 6, plus existing notion/crypto tests).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
