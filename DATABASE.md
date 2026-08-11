# Spendly — Database

PostgreSQL is the primary database.

Use Drizzle ORM.

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