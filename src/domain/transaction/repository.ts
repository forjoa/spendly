import "server-only"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import type { NewTransaction, Transaction } from "@/infrastructure/db/schema"

/*
  Transaction repository — data access for the transaction aggregate.

  All queries are scoped by userId. Idempotency relies on the unique index
  (userId, externalId); see DATABASE.md.
*/

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

export async function listByUser(
  userId: string,
  limit = 50,
): Promise<Transaction[]> {
  return db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.userId, userId))
    .orderBy(schema.transactions.date)
    .limit(limit)
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
