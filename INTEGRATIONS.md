# Spendly — Integrations

Spendly separates transaction processing from external integrations.

## Architecture

```text
Source
  ↓
Normalized Transaction
  ↓
Transaction Engine
  ↓
Destination Adapter
  ↓
External Service
```

## Sources

Initial source:

```text
Apple Wallet
→ iOS Shortcut
→ Spendly API
```

Future sources:

- Open Banking
- CSV
- Manual
- Public API

## Destinations

Initial destinations:

- Notion
- Webhook
- Custom API

### Notion (V0)

- Authenticated with a manually provided **internal integration token**.
- OAuth is **not** implemented in V0.
- The token is stored encrypted (see SECURITY.md) and never exposed to the client after saving.

#### V0 delivery flow

```text
authenticate → validate → persist transaction → deliver to Notion synchronously → respond
```

- No queues, Redis, workers, or cron in V0. Delivery is synchronous within the request.
- Persistence and delivery are separate responsibilities internally.
- The transaction is persisted **before** Notion delivery is attempted.
- Each delivery attempt is recorded in `TransactionDelivery` (`pending → delivered | failed`).
- Before delivering, if a `delivered` row already exists for `(transactionId, "notion")`, delivery is skipped and the stored `externalDeliveryId` is reused — this prevents duplicate Notion pages on a replay.

#### On Notion failure

- The transaction remains persisted (never rolled back or deleted).
- The `TransactionDelivery` row is marked `failed` with a sanitized error summary.
- The endpoint returns a `502` integration error.
- Notion credentials and raw internal errors are never exposed.
- The code is structured so an asynchronous delivery mechanism can be added later without rewriting the transaction domain.

Future destinations may include:

- Google Sheets
- YNAB
- Actual Budget
- other financial tools

## Adapter principle

Each external destination must have its own adapter.

Example:

```text
integrations/
├── notion/
│   └── NotionAdapter
├── webhook/
│   └── WebhookAdapter
└── custom-api/
    └── CustomApiAdapter
```

The transaction domain must never contain Notion-specific or provider-specific logic.

## Normalized transaction

Every destination receives the same internal transaction model.

Example:

```json
{
  "merchant": "Mercadona",
  "amountMinor": 2347,
  "currency": "EUR",
  "date": "2026-08-11T10:32:00Z",
  "type": "expense",
  "category": "food",
  "source": "apple_wallet"
}
```

`amountMinor` is an integer in the currency's minor units (e.g. cents). Amounts are never floating-point.

Adapters transform this model into the format required by the destination.

## Reliability

External delivery must support:

- authentication
- timeouts
- retries
- error reporting
- idempotency

A temporary failure in one integration must not corrupt the transaction itself.
