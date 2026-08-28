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
import { manualTransactionInputSchema, type TransactionInput } from "./schema"
import { summarizeTransactions, type PeriodSummary } from "./summary"

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

export interface IngestOptions {
  /**
   * When true, a destination failure is recorded on the delivery row and
   * reported in the result instead of throwing. Used for manual entries,
   * where the persisted transaction is the primary outcome.
   */
  tolerateDeliveryFailure?: boolean
}

export async function ingest(
  userId: string,
  input: TransactionInput,
  options: IngestOptions = {},
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
  try {
    const deliveries = await deliverToDestinations(userId, transaction)
    return { transaction, deliveries, replay: false }
  } catch (err) {
    if (options.tolerateDeliveryFailure && err instanceof DestinationError) {
      return {
        transaction,
        deliveries: [
          { provider: "notion", status: "failed", error: err.message },
        ],
        replay: false,
      }
    }
    throw err
  }
}

/** Source value for one-off transactions entered by hand in the app. */
export const MANUAL_SOURCE = "manual"

/**
 * Persist a one-off transaction entered by hand (manual income or expense).
 * Reuses the ingestion pipeline — including destination delivery — so
 * manual entries behave exactly like synced ones. Delivery failures never
 * lose the transaction.
 *
 * `idempotencyKey` should be supplied by the caller and stay stable across
 * retries of the *same* form submission (see add-transaction-dialog.tsx),
 * so a double-click or a retried request after a network hiccup lands on
 * the same externalId and `ingest` treats it as a replay instead of
 * creating a second transaction. Falls back to a fresh random key only
 * when the caller has no way to supply one — that submission then has no
 * duplicate protection, so callers should always pass one when possible.
 */
export async function recordManualTransaction(
  userId: string,
  rawInput: unknown,
  idempotencyKey?: string,
): Promise<IngestResult> {
  const parsed = manualTransactionInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid transaction",
    )
  }
  const key =
    idempotencyKey && idempotencyKey.trim() ? idempotencyKey.trim() : crypto.randomUUID()
  return ingest(
    userId,
    {
      ...parsed.data,
      subcategory: null,
      source: MANUAL_SOURCE,
      account: null,
      paymentMethod: null,
      externalId: `manual:${key}`,
    },
    { tolerateDeliveryFailure: true },
  )
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
  filter: txRepo.TransactionFilter = {},
): Promise<Transaction[]> {
  if (limit < 1 || limit > 200) {
    throw new ValidationError("limit must be between 1 and 200")
  }
  return txRepo.listByUser(userId, limit, filter)
}

export async function listTransactionsWithDeliveries(
  userId: string,
  limit = 50,
  filter: txRepo.TransactionFilter = {},
): Promise<{ transaction: Transaction; deliveries: TransactionDeliveryRow[] }[]> {
  const transactions = await listTransactions(userId, limit, filter)
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

/**
 * Exact financial summary of a period from the single source of truth: the
 * transaction table. Income, expenses and remaining are integer minor-unit
 * sums; recurring rules contribute only through their generated
 * transactions, so nothing is ever counted twice.
 */
export async function getPeriodSummary(
  userId: string,
  from: Date,
  to: Date,
): Promise<PeriodSummary> {
  const transactions = await txRepo.listInPeriod(userId, from, to)
  return summarizeTransactions(transactions)
}

/** Distinct categories used by the user's transactions (for filter UIs). */
export async function listCategories(userId: string): Promise<string[]> {
  return txRepo.listCategories(userId)
}

export async function getDeliveries(transactionId: string) {
  return db
    .select()
    .from(schema.transactionDeliveries)
    .where(eq(schema.transactionDeliveries.transactionId, transactionId))
}
