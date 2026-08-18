# Spendly — Security

Security is a core product requirement.

## Secrets

- Never expose secrets to the client.
- Never commit secrets to Git.
- Never log API keys, OAuth tokens or credentials.
- Never store credentials in plaintext when persistence is required.
- Use environment variables for server-side secrets.

## Logging & observability

Structured logging is implemented in `src/lib/logger.ts` and documented in
`OBSERVABILITY.md`. The logger redacts secrets by key name and by string
shape, but redaction is defense-in-depth — do not rely on it.

Never log, even via the structured logger:

- API keys (`sk_live_...`), the `Authorization` header, Bearer tokens
- Notion integration tokens (`ntn_...`)
- `BETTER_AUTH_SECRET`, `SPENDLY_ENCRYPTION_KEY`, `DATABASE_URL`
- Cookies, sessions, passwords, raw decrypted credentials, credential hashes
- Full request body values (log field presence/type/length via `summarizeBody`)

Stack traces may be logged to Axiom/Vercel for diagnostics, but must never be
returned to the client in an HTTP response. Client responses are always
sanitized via `errorResponse()`.

## Authentication

- Every protected resource must belong to an authenticated user.
- Never trust user IDs supplied by the client.
- Verify ownership server-side.
- API keys must be hashed or securely stored.
- API keys must only provide the minimum required access.

### API keys (V0)

- Generate keys with a cryptographically secure random source.
- Store only a secure hash of the key; never persist the raw key.
- Show the raw key to the user exactly once, at creation time.
- Never log the raw key or its hash.

### Integration credentials (V0)

- The Notion internal integration token is persisted using application-level encryption.
- Algorithm: **AES-256-GCM** with a unique nonce/IV per encrypted value; the GCM auth tag is stored alongside the ciphertext.
- The encryption key is a server-side secret in `SPENDLY_ENCRYPTION_KEY` (required).
- The encryption implementation is **server-only** and isolated from the UI; it is never imported into client components.
- The token is never returned to the client after it has been saved.

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
