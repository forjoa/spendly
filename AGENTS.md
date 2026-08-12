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
