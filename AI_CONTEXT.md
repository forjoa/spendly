# Spendly — AI Context

## Product

Spendly is a SaaS for automatic personal expense tracking.

The core idea:

**Pay → transaction detected → Spendly processes it → user receives it wherever they want.**

The first source is Apple Wallet through an iOS Shortcut.

The first destination is Notion.

Notion is an integration, not the product.

## Stack

- Next.js
- TypeScript
- PostgreSQL (Neon)
- Drizzle ORM
- Better Auth (email/password)
- Vercel
- Tailwind CSS
- shadcn/ui

## Architecture

Spendly is a modular monolith.

Core flow:

`Source → Transaction Engine → Destination`

The domain must not depend directly on external integrations.

External services are implemented through adapters.

## Product principles

- Minimal UX.
- Premium visual quality.
- Automatic by default.
- No unnecessary configuration.
- Reliability over complexity.
- Privacy and security are critical.
- Do not over-engineer.

## Current milestone

V0:

`Apple Wallet → Shortcut → Spendly API → Notion`

The immediate goal is to prove that a real Wallet transaction can enter Spendly and become a Notion transaction automatically.

### V0 confirmed decisions

- Database: Neon PostgreSQL + Drizzle ORM.
- Auth: Better Auth with email/password only.
- Notion: manually provided internal integration token. No OAuth in V0.
- Money: store as integer minor units (e.g. EUR cents); keep `currency` separate. Never use floating-point for amounts.
- Idempotency: minimal idempotency and input validation are in scope for V0. Full retry/error-recovery machinery remains V1.
- Schema: minimal — `User`, `Transaction`, `ApiKey`, and a minimal `Connection`. No generic `Destination` model in V0.
- Ingestion API: `POST /api/transactions`.
- API keys: generated securely, only a secure hash is stored, raw key shown once, never logged.
- Notion credentials: application-level encryption using a server-side key from environment variables. Token is never returned to the client after being saved.

## Current state

The repository is in early development.

Do not assume features exist unless they are implemented in the repository.

## AI rules

Before making changes:

1. Read this file.
2. Read the relevant documentation.
3. Inspect the existing code.
4. Preserve the existing architecture.
5. Make the smallest correct change.
6. Do not introduce dependencies without a reason.
7. Do not build future features unless explicitly requested.
8. Do not replace working code unnecessarily.
9. Update documentation when an architectural decision changes.

Never expose secrets, tokens or credentials.

Never put business logic inside React components.

Never make the domain layer depend on Next.js, PostgreSQL or a specific integration.
