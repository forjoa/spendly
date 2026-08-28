import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Transaction } from "@/infrastructure/db/schema"

/*
  Transaction service tests — focused on the ingestion idempotency contract,
  since that is the load-bearing guarantee against duplicate money entering
  the app. The repository/connection modules are mocked at the function
  boundary (not the raw db client): recordManualTransaction/ingest only call
  their exported functions, and no Notion connection exists in these tests,
  so delivery is skipped and never touches the adapter.
*/

let store: Transaction[]
let nextId: number

vi.mock("./repository", () => ({
  findByExternalId: vi.fn(
    async (userId: string, externalId: string) =>
      store.find((t) => t.userId === userId && t.externalId === externalId),
  ),
  insert: vi.fn(async (input: Partial<Transaction>) => {
    const row = {
      id: `tx-${nextId++}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...input,
    } as Transaction
    store.push(row)
    return row
  }),
}))

vi.mock("./delivery-repository", () => ({
  findByTransactionAndProvider: vi.fn(async () => undefined),
  insert: vi.fn(async (input: Record<string, unknown>) => ({ id: "delivery-1", ...input })),
  markDelivered: vi.fn(async () => undefined),
  markFailed: vi.fn(async () => undefined),
}))

vi.mock("@/domain/connection/repository", () => ({
  // No Notion connection configured — deliverToDestinations short-circuits
  // before it would need the crypto/Notion adapter modules.
  connectionRepo: { findByUserAndProvider: vi.fn(async () => undefined) },
}))

const { recordManualTransaction } = await import("./service")

const USER_A = "user-a"

const baseInput = {
  merchant: "Coffee Shop",
  amount: "5.00",
  currency: "EUR",
  date: "2026-08-05",
  type: "expense" as const,
}

beforeEach(() => {
  store = []
  nextId = 1
})

describe("recordManualTransaction idempotency", () => {
  it("persists a new transaction on the first call", async () => {
    const result = await recordManualTransaction(USER_A, baseInput, "key-1")
    expect(result.replay).toBe(false)
    expect(store).toHaveLength(1)
    expect(store[0]!.amountMinor).toBe(500)
  })

  it("a retry with the same idempotency key replays instead of duplicating", async () => {
    const first = await recordManualTransaction(USER_A, baseInput, "key-1")
    const second = await recordManualTransaction(USER_A, baseInput, "key-1")

    expect(second.replay).toBe(true)
    expect(second.transaction.id).toBe(first.transaction.id)
    expect(store).toHaveLength(1)
  })

  it("a different idempotency key creates a genuinely separate transaction", async () => {
    await recordManualTransaction(USER_A, baseInput, "key-1")
    await recordManualTransaction(USER_A, baseInput, "key-2")
    expect(store).toHaveLength(2)
  })

  it("two calls with no idempotency key at all are NOT deduplicated (documents the unprotected fallback)", async () => {
    await recordManualTransaction(USER_A, baseInput)
    await recordManualTransaction(USER_A, baseInput)
    expect(store).toHaveLength(2)
  })

  it("the same key does not dedupe across different users", async () => {
    await recordManualTransaction(USER_A, baseInput, "shared-key")
    await recordManualTransaction("user-b", baseInput, "shared-key")
    expect(store).toHaveLength(2)
  })
})
