# Spendly — Security

Security is a core product requirement.

## Secrets

- Never expose secrets to the client.
- Never commit secrets to Git.
- Never log API keys, OAuth tokens or credentials.
- Never store credentials in plaintext when persistence is required.
- Use environment variables for server-side secrets.

## Authentication

- Every protected resource must belong to an authenticated user.
- Never trust user IDs supplied by the client.
- Verify ownership server-side.
- API keys must be hashed or securely stored.
- API keys must only provide the minimum required access.

## API

Every external input must be:

- authenticated
- validated
- type-safe
- sanitized where appropriate

Never trust:

- request bodies
- headers
- query parameters
- external API responses

## Transactions

Transaction ingestion must be idempotent.

Retries must never create duplicate transactions.

## Privacy

Financial data is sensitive.

Only collect data required for the product.

Never expose one user's transactions to another user.

## Development

Never use real financial credentials in tests.

Never commit real transaction data.

Never disable security controls to make development easier.