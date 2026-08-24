import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  uniqueIndex,
  index,
  jsonb,
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

export const logLevelEnum = pgEnum("log_level", ["info", "warn", "error"])

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "monthly",
  "yearly",
])

// ── Better Auth tables ─────────────────────────────────────────────────
// These tables are owned by Spendly in the public schema and mirror Better
// Auth's expected model shapes (see @better-auth/core get-tables). They are
// passed to the Drizzle adapter in src/infrastructure/auth/auth.ts so Better
// Auth reads and writes exclusively through public-schema tables.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const session = pgTable(
  "session",
  {
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
  },
  (t) => [index("session_user_idx").on(t.userId)],
)

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
)

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
)

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
    // Set when the transaction was generated by a recurring rule.
    // Deliberately NOT a foreign key (same rationale as
    // application_log.transaction_id): rules are deactivated, not deleted, and
    // the generated transaction must never depend on the rule row existing.
    recurringRuleId: uuid("recurring_rule_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("transaction_user_idx").on(t.userId),
    index("transaction_date_idx").on(t.userId, t.date),
    uniqueIndex("transaction_user_external_idx").on(t.userId, t.externalId),
  ],
)

// ── recurring rules ────────────────────────────────────────────────────

/*
  A recurring rule describes money that arrives or leaves on a schedule
  (salary, rent, subscriptions). Rules are never hard-deleted when they have
  generated transactions: deactivation stops future occurrences while the
  generated transactions stay as the historical record.

  Materialization is lazy and idempotent: when due, a transaction is inserted
  with externalId "recurring:{ruleId}:{occurrenceDate}", so the unique
  (userId, externalId) index guarantees each occurrence is counted exactly
  once. The Overview always reads generated transactions, never the rule
  itself, so nothing is double-counted.
*/
export const recurringRules = pgTable(
  "recurring_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    // Only "income" and "expense" are meaningful for recurring rules.
    type: transactionTypeEnum("type").notNull(),
    category: text("category"),
    frequency: recurringFrequencyEnum("frequency").notNull(),
    // Day of month (1-31) for monthly/yearly rules. Clamped to the month's
    // last day when the month is shorter (e.g. 31 → 28 in February).
    dayOfMonth: integer("day_of_month"),
    // Month of year (1-12). Only used by yearly rules.
    monthOfYear: integer("month_of_year"),
    // First occurrence date (UTC midnight).
    startDate: timestamp("start_date").notNull(),
    // Next occurrence to materialize (UTC midnight). Advanced after each
    // generated transaction.
    nextRunDate: timestamp("next_run_date").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("recurring_rule_user_idx").on(t.userId),
    index("recurring_rule_due_idx").on(t.active, t.nextRunDate),
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

// ── application logs ──────────────────────────────────────────────────

export const applicationLogs = pgTable(
  "application_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null for events emitted before authentication (e.g. auth failures).
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    requestId: text("request_id"),
    // Deliberately NOT a foreign key: a log insert must never fail because
    // the referenced transaction row does not exist (yet). Correlation only.
    transactionId: uuid("transaction_id"),
    level: logLevelEnum("level").notNull(),
    event: text("event").notNull(),
    message: text("message"),
    // Structured payload, already redacted by the logger before persistence.
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("application_log_user_created_idx").on(t.userId, t.createdAt),
    index("application_log_request_idx").on(t.requestId),
    index("application_log_transaction_idx").on(t.transactionId),
    index("application_log_event_idx").on(t.userId, t.event),
  ],
)

// ── types ──────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type Account = typeof account.$inferSelect
export type Verification = typeof verification.$inferSelect
export type Connection = typeof connections.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type RecurringRule = typeof recurringRules.$inferSelect
export type TransactionDelivery = typeof transactionDeliveries.$inferSelect
export type ApplicationLog = typeof applicationLogs.$inferSelect

export type NewConnection = typeof connections.$inferInsert
export type NewApiKey = typeof apiKeys.$inferInsert
export type NewTransaction = typeof transactions.$inferInsert
export type NewRecurringRule = typeof recurringRules.$inferInsert
export type NewTransactionDelivery = typeof transactionDeliveries.$inferInsert
export type NewApplicationLog = typeof applicationLogs.$inferInsert
