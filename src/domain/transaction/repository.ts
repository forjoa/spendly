import "server-only"
import { and, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import type { NewTransaction, Transaction } from "@/infrastructure/db/schema"

/*
  Transaction repository — data access for the transaction aggregate.

  All queries are scoped by userId. Idempotency relies on the unique index
  (userId, externalId); see DATABASE.md.

  Lists are always ordered newest-first (date desc, createdAt desc as the
  tie-breaker) so the most recent transaction appears at the top everywhere.
*/

export interface TransactionFilter {
  /** Inclusive lower bound on the transaction date. */
  from?: Date
  /** Inclusive upper bound on the transaction date. */
  to?: Date
  type?: "expense" | "income" | "transfer" | "refund"
  category?: string
  /** Case-insensitive substring match on merchant. */
  query?: string
  /** Inclusive bounds on the absolute amount, in minor units. */
  minAmountMinor?: number
  maxAmountMinor?: number
}

export async function findByExternalId(
  userId: string,
  externalId: string,
): Promise<Transaction | undefined> {
  const [row] = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.userId, userId),
        eq(schema.transactions.externalId, externalId),
      ),
    )
    .limit(1)
  return row
}

export async function insert(
  tx: NewTransaction,
): Promise<Transaction> {
  const [row] = await db
    .insert(schema.transactions)
    .values(tx)
    .returning()
  if (!row) throw new Error("Transaction insert returned no rows")
  return row
}

function buildConditions(userId: string, filter: TransactionFilter): SQL[] {
  const conditions: SQL[] = [eq(schema.transactions.userId, userId)]
  if (filter.from) conditions.push(gte(schema.transactions.date, filter.from))
  if (filter.to) conditions.push(lte(schema.transactions.date, filter.to))
  if (filter.type) conditions.push(eq(schema.transactions.type, filter.type))
  if (filter.category) {
    conditions.push(eq(schema.transactions.category, filter.category))
  }
  if (filter.query) {
    conditions.push(ilike(schema.transactions.merchant, `%${filter.query}%`))
  }
  if (filter.minAmountMinor !== undefined) {
    conditions.push(gte(schema.transactions.amountMinor, filter.minAmountMinor))
  }
  if (filter.maxAmountMinor !== undefined) {
    conditions.push(lte(schema.transactions.amountMinor, filter.maxAmountMinor))
  }
  return conditions
}

export async function listByUser(
  userId: string,
  limit = 50,
  filter: TransactionFilter = {},
): Promise<Transaction[]> {
  return db
    .select()
    .from(schema.transactions)
    .where(and(...buildConditions(userId, filter)))
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
    .limit(limit)
}

/** Every transaction in [from, to], newest-first. Used for period summaries. */
export async function listInPeriod(
  userId: string,
  from: Date,
  to: Date,
): Promise<Transaction[]> {
  return db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.userId, userId),
        gte(schema.transactions.date, from),
        lte(schema.transactions.date, to),
      ),
    )
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
}

/** Distinct categories the user has used, for filter dropdowns. */
export async function listCategories(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: schema.transactions.category })
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, userId))
  return rows
    .map((r) => r.category)
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .sort((a, b) => a.localeCompare(b))
}

export async function getById(
  userId: string,
  id: string,
): Promise<Transaction | undefined> {
  const [row] = await db
    .select()
    .from(schema.transactions)
    .where(
      and(eq(schema.transactions.userId, userId), eq(schema.transactions.id, id)),
    )
    .limit(1)
  return row
}
