import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core"

/*
  Spendly database schema (PostgreSQL / Neon).

  Authoritative source: DATABASE.md and INTEGRATIONS.md.
  - Money is integer minor units + ISO 4217 currency. Never floats.
  - Transactions are idempotent on (userId, externalId).
  - Delivery is idempotent on (transactionId, provider).
  - All user-owned rows carry userId.
*/

// ── enums ──────────────────────────────────────────────────────────────

export const transactionTypeEnum = pgEnum("transaction_type", [
  "expense",
  "income",
  "transfer",
  "refund",
])

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "delivered",
  "failed",
  "skipped",
])

export const connectionProviderEnum = pgEnum("connection_provider", [
  "notion",
  "google_sheets",
  "ynab",
  "webhook",
  "custom_api",
])

// ── users (Better Auth managed) ────────────────────────────────────────
// Better Auth creates its own `user` and `session` tables. We mirror the
// minimal shape here for foreign keys; Better Auth's generated tables are
// the source of truth for identity.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// ── connections ────────────────────────────────────────────────────────

export const connections = pgTable(
  "connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: connectionProviderEnum("provider").notNull(),
    label: text("label").notNull(),
    // Encrypted credential blob (AES-256-GCM, see src/lib/crypto.ts).
    // For Notion V0 this is the internal integration token. Server-only.
    encryptedCredential: text("encrypted_credential").notNull(),
    // Whether the user has enabled this connection for delivery.
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("connection_user_idx").on(t.userId),
    index("connection_provider_idx").on(t.userId, t.provider),
  ],
)

// ── api keys ───────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    // SHA-256 hash of the raw key. The raw key is shown once at creation.
    keyHash: text("key_hash").notNull().unique(),
    // Last 4 characters of the raw key, for display in the UI.
    keySuffix: text("key_suffix").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("api_key_user_idx").on(t.userId),
    uniqueIndex("api_key_hash_idx").on(t.keyHash),
  ],
)

// ── transactions ────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    merchant: text("merchant").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    date: timestamp("date").notNull(),
    type: transactionTypeEnum("type").notNull().default("expense"),
    category: text("category"),
    subcategory: text("subcategory"),
    source: text("source").notNull(),
    account: text("account"),
    paymentMethod: text("payment_method"),
    // Client-supplied idempotency key. Unique per user per source.
    externalId: text("external_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("transaction_user_idx").on(t.userId),
    index("transaction_date_idx").on(t.userId, t.date),
    uniqueIndex("transaction_user_external_idx").on(t.userId, t.externalId),
  ],
)

// ── transaction deliveries ─────────────────────────────────────────────

export const transactionDeliveries = pgTable(
  "transaction_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    // Provider-returned id (e.g. Notion page id). Reused on idempotent replay.
    externalDeliveryId: text("external_delivery_id"),
    // Sanitized error summary. Never contains credentials or raw internals.
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("delivery_transaction_provider_idx").on(
      t.transactionId,
      t.provider,
    ),
    index("delivery_status_idx").on(t.status),
  ],
)

// ── types ──────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type Connection = typeof connections.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type TransactionDelivery = typeof transactionDeliveries.$inferSelect

export type NewConnection = typeof connections.$inferInsert
export type NewApiKey = typeof apiKeys.$inferInsert
export type NewTransaction = typeof transactions.$inferInsert
export type NewTransactionDelivery = typeof transactionDeliveries.$inferInsert
