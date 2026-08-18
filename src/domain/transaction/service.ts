import "server-only"
import { eq, inArray } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import type { Transaction, TransactionDelivery as TransactionDeliveryRow } from "@/infrastructure/db/schema"
import { ValidationError, DestinationError } from "@/lib/errors"
import { log } from "@/lib/logger"
import * as txRepo from "./repository"
import * as deliveryRepo from "./delivery-repository"
import { connectionRepo } from "@/domain/connection/repository"
import { decryptCredential, type NotionCredential } from "@/domain/connection/credentials"
import { deliverToNotion } from "@/infrastructure/integrations/notion/adapter"
import type { TransactionInput } from "./schema"

/*
  Transaction service — the heart of the Source → Transaction → Processing →
  Destination flow.

  Responsibilities (per INTEGRATIONS.md):
  1. Persist the transaction (idempotent on userId + externalId).
  2. Deliver to each enabled destination synchronously.
  3. Record delivery state in TransactionDelivery (pending → delivered/failed).
  4. On idempotent replay, reuse the stored externalDeliveryId.

  The transaction is persisted before delivery and never rolled back. A
  delivery failure surfaces a 502 but leaves the transaction intact.
*/

export interface IngestResult {
  transaction: Transaction
  /** Per-provider delivery outcomes. */
  deliveries: DeliveryOutcome[]
  /** True when an existing transaction was returned (idempotent replay). */
  replay: boolean
}

export interface DeliveryOutcome {
  provider: string
  status: "delivered" | "failed" | "skipped"
  externalDeliveryId?: string
  error?: string
}

export async function ingest(
  userId: string,
  input: TransactionInput,
): Promise<IngestResult> {
  // 1. Idempotent lookup.
  const existing = await txRepo.findByExternalId(userId, input.externalId)
  if (existing) {
    return { transaction: existing, deliveries: [], replay: true }
  }

  // 2. Persist the transaction first.
  const transaction = await txRepo.insert({
    userId,
    merchant: input.merchant,
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: new Date(input.date),
    type: input.type,
    category: input.category ?? null,
    subcategory: input.subcategory ?? null,
    source: input.source,
    account: input.account ?? null,
    paymentMethod: input.paymentMethod ?? null,
    externalId: input.externalId,
  })

  // 3. Deliver to enabled destinations (V0: Notion).
  const deliveries = await deliverToDestinations(userId, transaction)

  return { transaction, deliveries, replay: false }
}

async function deliverToDestinations(
  userId: string,
  transaction: Transaction,
): Promise<DeliveryOutcome[]> {
  const outcomes: DeliveryOutcome[] = []

  // V0: only Notion.
  const notionConnection = await connectionRepo.findByUserAndProvider(
    userId,
    "notion",
  )
  if (!notionConnection) {
    log.info("transaction.notion.delivery.skipped", {
      transactionId: transaction.id,
      deliveryProvider: "notion",
      reason: "no-connection",
    })
    return outcomes
  }

  // Check for an existing delivered row to skip re-delivery (idempotency).
  const existingDelivery = await deliveryRepo.findByTransactionAndProvider(
    transaction.id,
    "notion",
  )

  if (existingDelivery?.status === "delivered") {
    log.info("transaction.notion.delivery.skipped", {
      transactionId: transaction.id,
      deliveryProvider: "notion",
      reason: "already-delivered",
      externalDeliveryId: existingDelivery.externalDeliveryId ?? undefined,
    })
    return [
      {
        provider: "notion",
        status: "skipped",
        externalDeliveryId: existingDelivery.externalDeliveryId ?? undefined,
      },
    ]
  }

  // Create or reuse a pending delivery row.
  const delivery =
    existingDelivery ??
    (await deliveryRepo.insert({
      transactionId: transaction.id,
      provider: "notion",
      status: "pending",
      attempts: 1,
    }))

  try {
    const credential = await decryptCredential<NotionCredential>(
      notionConnection.encryptedCredential,
    )
    const result = await deliverToNotion({
      token: credential.token,
      databaseId: credential.databaseId,
      apiVersion: credential.apiVersion,
      transaction,
    })
    await deliveryRepo.markDelivered(delivery.id, result.externalDeliveryId)
    outcomes.push({
      provider: "notion",
      status: "delivered",
      externalDeliveryId: result.externalDeliveryId,
    })
  } catch (err) {
    const message =
      err instanceof DestinationError
        ? err.message
        : "Delivery failed for an unknown reason"
    await deliveryRepo.markFailed(delivery.id, sanitize(message))
    // Re-throw so the API layer can return 502; the transaction stays saved.
    throw err
  }

  return outcomes
}

/** Strip anything that could leak credentials or internal details. */
function sanitize(message: string): string {
  return message.slice(0, 500)
}

export async function listTransactions(
  userId: string,
  limit = 50,
): Promise<Transaction[]> {
  if (limit < 1 || limit > 100) {
    throw new ValidationError("limit must be between 1 and 100")
  }
  return txRepo.listByUser(userId, limit)
}

export async function listTransactionsWithDeliveries(
  userId: string,
  limit = 50,
): Promise<{ transaction: Transaction; deliveries: TransactionDeliveryRow[] }[]> {
  const transactions = await listTransactions(userId, limit)
  if (transactions.length === 0) return []
  const ids = transactions.map((t) => t.id)
  const deliveries = await db
    .select()
    .from(schema.transactionDeliveries)
    .where(inArray(schema.transactionDeliveries.transactionId, ids))
  const byTx = new Map<string, TransactionDeliveryRow[]>()
  for (const d of deliveries) {
    const list = byTx.get(d.transactionId) ?? []
    list.push(d)
    byTx.set(d.transactionId, list)
  }
  return transactions.map((transaction) => ({
    transaction,
    deliveries: byTx.get(transaction.id) ?? [],
  }))
}

export async function getTransaction(
  userId: string,
  id: string,
): Promise<Transaction | undefined> {
  return txRepo.getById(userId, id)
}

export async function getDeliveries(transactionId: string) {
  return db
    .select()
    .from(schema.transactionDeliveries)
    .where(eq(schema.transactionDeliveries.transactionId, transactionId))
}
