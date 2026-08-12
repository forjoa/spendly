# Spendly

**Automatic expense tracking without manual entry.**

Spendly captures financial transactions, processes them automatically, and sends them to the tools people already use.

```text
Pay
 ↓
Spendly
 ↓
Wherever you want
```

## Status

Early development.

## Vision

A simple financial automation platform that connects transaction sources with any destination.

## Stack

- Next.js (App Router, TypeScript)
- PostgreSQL (Neon)
- Drizzle ORM
- Better Auth (email/password + API keys)
- Vercel
- Tailwind CSS
- shadcn/ui

## Development

The project is currently focused on:

```text
Apple Wallet
→ iOS Shortcut
→ Spendly
→ Notion
```

See `AI_CONTEXT.md` for the current development context.

### Local setup

```bash
cp .env.example .env      # fill in DATABASE_URL, BETTER_AUTH_SECRET, SPENDLY_ENCRYPTION_KEY
npm install
npm run db:push           # apply the schema to your Postgres database
npm run dev               # http://localhost:3000
```

Checks before considering work done:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```