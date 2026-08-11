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

## Relationships

```text
User
 ├── Transactions
 ├── Connections
 ├── Destinations
 └── ApiKeys
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
