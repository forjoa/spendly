# Spendly — Database

PostgreSQL (Neon) is the primary database.

Use Drizzle ORM.

## Money representation

- Store monetary amounts as **integer minor units** (for EUR, cents).
- Store `currency` as a separate ISO 4217 code.
- Never use floating-point types for financial amounts.

## Core entities

### User

Owns all user data.

### Transaction

Represents a normalized financial movement.

Conceptually:

```text
id
userId
merchant
amount
currency
date
type
category
subcategory
source
account
paymentMethod
externalId
createdAt
updatedAt
```

`type` must eventually support:

```text
expense
income
transfer
refund
```

### Connection

Represents an authenticated connection between a user and an external service.

Examples:

```text
Notion
Google Sheets
Webhook
Bank
```

### Destination

Represents where processed transactions are delivered.

A user may have multiple destinations.

> **V0 note:** the generic `Destination` model is **not** built in V0. For V0, the Notion target lives inside the minimal `Connection` record. Introduce `Destination` only when a second destination type is added (V2).

### ApiKey

Represents credentials used by external clients such as the iOS Shortcut.

Never store raw API keys.

### TransactionDelivery

Records the delivery state of a transaction to a single external provider.

Minimal and integration-agnostic (no Notion-specific fields):

```text
id
transactionId
provider          -- e.g. "notion"
status            -- pending | delivered | failed
externalDeliveryId -- id returned by the provider (e.g. Notion page id)
error             -- last error summary, nullable, never contains credentials
createdAt
updatedAt
```

Purpose: guarantee that the same external transaction never produces multiple Notion pages. A `delivered` row short-circuits re-delivery on an idempotent replay. This table lets us add more destinations later without changing the `Transaction` model.

### ApplicationLog

Structured application log events persisted by the logger's PostgreSQL sink (`src/infrastructure/observability/db-sink.ts`). Powers the authenticated `/logs` view.

```text
id
userId          -- nullable; null for events emitted before authentication
requestId       -- nullable; correlates all events of one request
transactionId   -- nullable uuid; correlation only, deliberately NO foreign key
level           -- info | warn | error
event           -- e.g. "transaction.validation.failed"
message         -- nullable
metadata        -- jsonb, nullable; already redacted by the logger
createdAt
```

Rules:
- Every read is scoped by `userId`; a user can never see another user's logs.
- Events are written already redacted (the logger's redaction pass runs before sinks), so no API keys, tokens, or credentials are ever persisted.
- `transactionId` has no FK on purpose: a log insert must never fail because the referenced transaction row does not exist.

## Relationships

```text
User
 ├── Transactions
 │    └── TransactionDeliveries
 ├── Connections
 ├── Destinations
 ├── ApiKeys
 └── ApplicationLogs
```

## Principles

- Every user-owned record must contain ownership information.
- Transactions must support idempotency.
- Avoid premature normalization.
- Do not add entities without a real requirement.

## Idempotency strategy (V0)

- Each transaction carries a client-supplied `externalId`.
- A unique constraint on `(userId, externalId)` guarantees a given source transaction is stored at most once per user.
- Re-sending the same `(userId, externalId)` returns the existing transaction rather than creating a duplicate.
- Delivery idempotency is tracked separately in `TransactionDelivery` via a unique `(transactionId, provider)` constraint, so a replay never creates a second Notion page.
