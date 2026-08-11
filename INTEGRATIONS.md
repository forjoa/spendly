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
  "amount": 23.47,
  "currency": "EUR",
  "date": "2026-08-11T10:32:00Z",
  "type": "expense",
  "category": "food",
  "source": "apple_wallet"
}
```

Adapters transform this model into the format required by the destination.

## Reliability

External delivery must support:

- authentication
- timeouts
- retries
- error reporting
- idempotency

A temporary failure in one integration must not corrupt the transaction itself.