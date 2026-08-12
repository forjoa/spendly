import "server-only"
import { NextResponse } from "next/server"
import { authenticateApiKey } from "@/infrastructure/auth/api-key"
import { ingest, listTransactions } from "@/domain/transaction/service"
import {
  transactionInputSchema,
  transactionInputArraySchema,
  type TransactionInput,
} from "@/domain/transaction/schema"
import { errorResponse, json } from "../_lib/errors"

/*
  POST /api/transactions
    Public ingestion endpoint used by the Apple Wallet iOS Shortcut.
    Authenticated with a Spendly API key (Bearer token).

    Accepts either a single transaction object or an array (max 50).
    Idempotent on (userId, externalId). Delivery to Notion is synchronous.

  GET /api/transactions
    Lists the authenticated user's recent transactions.
*/

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(new Error("Invalid JSON body"))
  }

  try {
    const { userId } = await authenticateApiKey()

    const isArray = Array.isArray(body)
    const parsed = isArray
      ? transactionInputArraySchema.safeParse(body)
      : transactionInputSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse(parsed.error)
    }

    const inputs: TransactionInput[] = isArray
      ? (parsed.data as TransactionInput[])
      : [parsed.data as TransactionInput]
    const results = []
    for (const input of inputs) {
      const result = await ingest(userId, input)
      results.push({
        id: result.transaction.id,
        externalId: result.transaction.externalId,
        replay: result.replay,
        merchant: result.transaction.merchant,
        amountMinor: result.transaction.amountMinor,
        currency: result.transaction.currency,
      })
    }

    return json(
      isArray ? { transactions: results } : results[0]!,
      { status: results.some((r) => r.replay) ? 200 : 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { userId } = await authenticateApiKey()
    const url = new URL(request.url)
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50
    const transactions = await listTransactions(userId, Number.isFinite(limit) ? limit : 50)
    return json({ transactions })
  } catch (error) {
    return errorResponse(error)
  }
}
