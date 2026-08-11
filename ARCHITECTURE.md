# Spendly — Architecture

## Philosophy

Spendly is a modular monolith.

Keep the system simple until scale requires otherwise.

## High-level flow

```text
SOURCE
  ↓
TRANSACTION
  ↓
PROCESSING
  ↓
DESTINATION
```

Examples:

```text
Apple Wallet
  ↓
iOS Shortcut
  ↓
Spendly API
  ↓
Transaction Engine
  ↓
Notion
```

## Code structure

```text
src/
├── app/
├── components/
├── domain/
├── infrastructure/
├── integrations/
└── lib/
```

### `app`

Next.js routes, pages and API endpoints.

### `components`

Reusable UI components.

### `domain`

Core business logic.

The domain must not know about:

- Next.js
- PostgreSQL
- Notion
- Vercel
- external APIs

### `infrastructure`

Technical implementations such as:

- database
- authentication
- persistence

### `integrations`

External service adapters.

Examples:

```text
integrations/
├── notion/
├── webhook/
└── custom-api/
```

### `lib`

Shared technical utilities that do not belong to the domain.

## Integration principle

The transaction engine produces a normalized internal transaction.

Destinations consume that transaction through adapters.

Adding a new destination should not require changing the transaction domain.

## API principle

All external transaction ingestion must be:

- authenticated
- validated
- idempotent
- observable
- safe to retry

## Avoid

- Microservices
- unnecessary abstractions
- duplicated business logic
- integration-specific logic in the domain
- direct database access from UI components