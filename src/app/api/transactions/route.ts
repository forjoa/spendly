import "server-only"
import { NextResponse } from "next/server"
import { authenticateApiKey } from "@/infrastructure/auth/api-key"
import { ingest, listTransactions } from "@/domain/transaction/service"
import {
  transactionInputSchema,
  transactionInputArraySchema,
  type TransactionInput,
} from "@/domain/transaction/schema"
import { log, attachLogContext } from "@/lib/logger"
import { errorResponse, json } from "../_lib/errors"
import { withApiLogging } from "../_lib/api-handler"
import { summarizeBody } from "../_lib/body-inspect"
import type { z } from "zod"

/*
  POST /api/transactions
    Public ingestion endpoint used by the Apple Wallet iOS Shortcut.
    Authenticated with a Spendly API key (Bearer token).

    Accepts either a single transaction object or an array (max 50).
    Idempotent on (userId, externalId). Delivery to Notion is synchronous.

  GET /api/transactions
    Lists the authenticated user's recent transactions.

  Both routes are wrapped with `withApiLogging`, which establishes a
  requestId-scoped log context and emits request.received / request.completed.
  See docs/observability.md for the full event catalog.
*/

const MAX_BATCH = 50

export const POST = withApiLogging(async (request: Request): Promise<NextResponse> => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    // Body could not be parsed as JSON. This is diagnostic but not sensitive.
    log.warn("transaction.body.parse_failed", {
      contentType: request.headers.get("content-type"),
    })
    return errorResponse(new Error("Invalid JSON body"))
  }

  // Safe, value-free summary of the raw body — the key to diagnosing a real
  // Apple Wallet 422 (shows which fields arrived and their type/length).
  log.info("transaction.body.parsed", summarizeBody(body) as unknown as Record<string, unknown>)

  try {
    const { userId } = await authenticateApiKey()
    // From here on, every event in this request carries userId, so the /logs
    // view can reconstruct the operation (requestId + userId + transactionId).
    // Events emitted before this point keep userId = null by design.
    attachLogContext({ userId })

    const isArray = Array.isArray(body)
    const schema = isArray ? transactionInputArraySchema : transactionInputSchema
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      logZodFailure(isArray ? "transactionInputArraySchema" : "transactionInputSchema", parsed.error)
      return errorResponse(parsed.error)
    }

    const inputs: TransactionInput[] = isArray
      ? (parsed.data as TransactionInput[])
      : [parsed.data as TransactionInput]

    if (inputs.length > MAX_BATCH) {
      log.warn("transaction.batch.too_large", { count: inputs.length, max: MAX_BATCH })
    }

    const results = []
    for (const input of inputs) {
      log.info("transaction.ingest.started", {
        userId,
        externalId: truncate(input.externalId),
        merchant: truncate(input.merchant),
      })
      try {
        const result = await ingest(userId, input)
        log.info("transaction.persisted", {
          transactionId: result.transaction.id,
          replay: result.replay,
          deliveryCount: result.deliveries.length,
        })
        results.push({
          id: result.transaction.id,
          externalId: result.transaction.externalId,
          replay: result.replay,
          merchant: result.transaction.merchant,
          amountMinor: result.transaction.amountMinor,
          currency: result.transaction.currency,
        })
      } catch (error) {
        // Distinguish ingest failure (db or notion) from validation. The
        // nested try keeps the per-item failure isolated so a batch can still
        // surface a useful response. errorResponse handles sanitization.
        log.error("transaction.ingest.failed", {
          externalId: truncate(input.externalId),
          errorCode: error instanceof Error ? error.constructor.name : "Unknown",
          errorType: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error).slice(0, 200),
        })
        throw error
      }
    }

    return json(
      isArray ? { transactions: results } : results[0]!,
      { status: results.some((r) => r.replay) ? 200 : 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
})

export const GET = withApiLogging(async (request: Request): Promise<NextResponse> => {
  try {
    const { userId } = await authenticateApiKey()
    attachLogContext({ userId })
    const url = new URL(request.url)
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50
    const transactions = await listTransactions(userId, Number.isFinite(limit) ? limit : 50)
    return json({ transactions })
  } catch (error) {
    return errorResponse(error)
  }
})

/**
 * Log a Zod validation failure with the full issue list (code, path, message,
 * expected, received). The client still receives the existing sanitized 422
 * shape; Axiom/Vercel keep the complete diagnostic so the next real Apple
 * Wallet 422 is fully attributable.
 */
function logZodFailure(schema: string, error: z.ZodError): void {
  const issues = error.issues.map((raw) => {
    const issue = raw as unknown as Record<string, unknown>
    return {
      code: issue.code,
      path: issue.path,
      message: issue.message,
      expected: issue.expected !== undefined ? String(issue.expected) : undefined,
      received: issue.received !== undefined ? String(issue.received) : undefined,
    }
  })
  log.warn("transaction.validation.failed", { schema, issues })
}

/** Truncate an identifier for logging so full external ids are not retained. */
function truncate(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`
}
