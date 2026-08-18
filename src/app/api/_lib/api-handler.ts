import "server-only"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { log, runWithLogContext, newRequestId, type LogContext } from "@/lib/logger"
import { ensureAxiomSink, flushAxiom } from "@/infrastructure/observability/axiom-sink"

/**
 * Request lifecycle wrapper for the public API.
 *
 * Establishes a per-request log context (requestId) so every downstream
 * `log.*` call across auth → validation → ingest → db → notion → response
 * can be correlated by a single id in Axiom.
 *
 * Emits the bookend events:
 *   transaction.request.received   — on entry (method, path, userAgent, contentType)
 *   transaction.request.completed  — on exit  (statusCode, durationMs)
 *
 * Flushes the Axiom sink in `finally` so logs are shipped even when the
 * handler throws. Authorization is NEVER logged.
 */

export type ApiHandler = (request: Request) => Promise<NextResponse> | NextResponse

const REQUEST_ID_HEADERS = ["x-request-id", "x-vercel-id", "request-id"]

/**
 * Resolve a request id to attach to the log context. Prefers a client/Vercel
 * header so the id also matches Vercel's request id when present; falls back
 * to a freshly generated crypto UUID so correlation always works.
 */
async function resolveRequestId(): Promise<string> {
  const headerList = await headers()
  for (const name of REQUEST_ID_HEADERS) {
    const value = headerList.get(name)
    if (value && value.trim()) {
      // Vercel ids may be "ctx::<id>" scoped; keep the raw value verbatim for
      // exact correlation with Vercel logs when it exists.
      return value.trim()
    }
  }
  return newRequestId()
}

export function withApiLogging(handler: ApiHandler): ApiHandler {
  return async (request: Request): Promise<NextResponse> => {
    ensureAxiomSink()

    const requestId = await resolveRequestId()
    const context: LogContext = {
      requestId,
      // Anonymized path component (no query string) for grouping queries.
      path: new URL(request.url).pathname,
    }

    // Wrap the whole lifecycle so every event — including the bookend
    // received/completed events and the Axiom flush — shares requestId.
    return runWithLogContext(context, async () => {
      const startedAt = performance.now()

      // received — note: Authorization is intentionally NOT read/logged here.
      log.info("transaction.request.received", {
        method: request.method,
        path: context.path,
        userAgent: safeHeader(request, "user-agent"),
        contentType: safeHeader(request, "content-type"),
      })

      let response: NextResponse
      try {
        response = await handler(request)
      } catch (error) {
        // A handler should normally catch its own errors via errorResponse,
        // but guard against an uncaught throw so we still emit a completion
        // event and flush logs. The error is logged with full context for
        // diagnostics; the client receives a sanitized 500.
        log.error("transaction.request.uncaught", {
          errorType: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error).slice(0, 200),
          stack: error instanceof Error ? error.stack : undefined,
        })
        response = NextResponse.json(
          { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
          { status: 500 },
        )
      }

      const durationMs = Math.round(performance.now() - startedAt)
      log.info("transaction.request.completed", {
        statusCode: response.status,
        durationMs,
      })
      // Ship logs to Axiom (no-op when unconfigured). Must run inside the
      // request context so late events keep the requestId.
      await flushAxiom()

      return response
    })
  }
}

function safeHeader(request: Request, name: string): string | undefined {
  const value = request.headers.get(name)
  if (!value) return undefined
  // Cap length to avoid storing huge/binary headers.
  return value.length > 128 ? `${value.slice(0, 128)}…` : value
}
