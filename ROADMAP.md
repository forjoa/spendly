# Spendly — Roadmap

## V0 — First transaction

**Goal:** prove the core loop.

```text
Apple Wallet
→ iOS Shortcut
→ Spendly API
→ Transaction
→ Notion
```

Tasks:

- [ ] Create Next.js application
- [ ] Create database
- [ ] Create Transaction model
- [ ] Create authenticated transaction endpoint (with minimal idempotency + validation)
- [ ] Create Notion integration
- [ ] Create iOS Shortcut instructions
- [ ] Process a real transaction
- [ ] Create the transaction in Notion

> **Decision:** minimal idempotency and input validation are pulled into V0 (they are security invariants). Full retry and error-recovery machinery stays in V1.

---

## V1 — Expense Engine

**Goal:** make transaction processing reliable.

- [ ] Hardened idempotency (beyond V0 minimal)
- [ ] Comprehensive validation (beyond V0 minimal)
- [ ] Error handling
- [ ] Retry mechanism
- [ ] Transaction history
- [ ] Merchant normalization
- [ ] Basic categorization

---

## V2 — Connections

**Goal:** allow users to choose where their data goes.

- [ ] Connections UI
- [ ] Notion
- [ ] Webhooks
- [ ] Custom API
- [ ] API key management
- [ ] Connection health/status

---

## V3 — Intelligence

**Goal:** make Spendly understand expenses.

- [ ] Categories
- [ ] Rules
- [ ] Merchant mapping
- [ ] Recurring transaction detection
- [ ] AI categorization
- [ ] User corrections

---

## V4 — Banking

**Goal:** capture transactions beyond Apple Wallet.

- [ ] Open Banking provider
- [ ] Multiple bank accounts
- [ ] Transaction synchronization
- [ ] Transfer detection
- [ ] Refund detection

---

## V5 — Platform

**Goal:** turn Spendly into an extensible financial automation platform.

- [ ] Public API
- [ ] More integrations
- [ ] Integration marketplace
- [ ] Advanced analytics
- [ ] Billing
- [ ] Team/business features
