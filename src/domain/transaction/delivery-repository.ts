import "server-only"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import type { NewTransactionDelivery, TransactionDelivery } from "@/infrastructure/db/schema"

/*
  Transaction delivery repository — tracks delivery state per provider.

  Idempotency relies on the unique index (transactionId, provider); see
  DATABASE.md and INTEGRATIONS.md.
*/

export async function findByTransactionAndProvider(
  transactionId: string,
  provider: string,
): Promise<TransactionDelivery | undefined> {
  const [row] = await db
    .select()
    .from(schema.transactionDeliveries)
    .where(
      and(
        eq(schema.transactionDeliveries.transactionId, transactionId),
        eq(schema.transactionDeliveries.provider, provider),
      ),
    )
    .limit(1)
  return row
}

export async function insert(
  delivery: NewTransactionDelivery,
): Promise<TransactionDelivery> {
  const [row] = await db
    .insert(schema.transactionDeliveries)
    .values(delivery)
    .returning()
  if (!row) throw new Error("Delivery insert returned no rows")
  return row
}

export async function markDelivered(
  id: string,
  externalDeliveryId: string,
): Promise<TransactionDelivery | undefined> {
  const [row] = await db
    .update(schema.transactionDeliveries)
    .set({
      status: "delivered",
      externalDeliveryId,
      deliveredAt: new Date(),
      error: null,
    })
    .where(eq(schema.transactionDeliveries.id, id))
    .returning()
  return row
}

export async function markFailed(
  id: string,
  error: string,
): Promise<TransactionDelivery | undefined> {
  const [row] = await db
    .update(schema.transactionDeliveries)
    .set({ status: "failed", error })
    .where(eq(schema.transactionDeliveries.id, id))
    .returning()
  return row
}
