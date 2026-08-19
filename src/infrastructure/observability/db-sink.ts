import "server-only"
import { registerSink, getLogContext, type LogEvent } from "@/lib/logger"
import { recordApplicationLogs } from "@/domain/log/service"

/**
 * PostgreSQL log sink (server-only).
 *
 * Persists every structured event to the `application_log` table so the
 * authenticated /logs UI can render them per user. The sink receives events
 * AFTER the logger's redaction pass, so no secret material reaches the
 * database (API keys, tokens, Authorization headers, etc.).
 *
 * Buffering is per-request (keyed by requestId): concurrent requests never
 * share a batch, and at flush time the authenticated `userId` — attached to
 * the log context after `authenticateApiKey()` — is backfilled onto the
 * request's pre-auth events (request.received, body.parsed), so the full
 * story of an operation is queryable by userId in /logs. Events from
 * requests that fail authentication keep `userId = null` and remain visible
 * only in Axiom, never in another user's /logs view.
 *
 * Fail-safe by design: a database failure while persisting logs is reported
 * to the console ONLY (never through the logger, which would recurse) and
 * never throws into the request path. Observability is secondary; Spendly
 * must keep working if the log store is down.
 *
 * No-op when DATABASE_URL is not configured, so local dev and `next build`
 * keep working.
 */

/** Fields lifted to dedicated columns; everything else lands in metadata. */
const COLUMN_FIELDS = new Set([
  "timestamp",
  "level",
  "event",
  "requestId",
  "userId",
  "transactionId",
  "message",
])

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Bucket key for events emitted outside any request context. */
const GLOBAL_BUCKET = "__global__"

let _registered = false
let _buffers = new Map<string, LogEvent[]>()

export function ensureDbSink(): void {
  if (_registered) return
  _registered = true
  if (!process.env.DATABASE_URL) return
  registerSink(append)
}

function append(event: LogEvent): void {
  const key = typeof event.requestId === "string" ? event.requestId : GLOBAL_BUCKET
  const bucket = _buffers.get(key)
  if (bucket) bucket.push(event)
  else _buffers.set(key, [event])
}

function toRecord(event: LogEvent, fallbackUserId?: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event)) {
    if (!COLUMN_FIELDS.has(key) && value !== undefined) {
      metadata[key] = value
    }
  }

  // transactionId only qualifies for the uuid column if it is uuid-shaped;
  // otherwise it moves to metadata and the column stays null (no FK).
  const rawTxId = typeof event.transactionId === "string" ? event.transactionId : undefined
  const transactionId = rawTxId && UUID_RE.test(rawTxId) ? rawTxId : undefined
  if (rawTxId && !transactionId) metadata.transactionId = rawTxId

  const userId =
    typeof event.userId === "string" ? event.userId : fallbackUserId

  return {
    userId,
    requestId: typeof event.requestId === "string" ? event.requestId : undefined,
    transactionId,
    level: event.level,
    event: event.event,
    message: typeof event.message === "string" ? event.message : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    timestamp: event.timestamp,
  }
}

/**
 * Flush the current request's buffered events to PostgreSQL in a single
 * batch insert. Called by the request wrapper after the response is
 * produced, inside the request's log context. Never throws.
 */
export async function flushDbLogs(): Promise<void> {
  const ctx = getLogContext()
  const key = ctx?.requestId ?? GLOBAL_BUCKET

  // Drain atomically: this request's bucket, plus the global bucket (events
  // emitted outside any request context, which have no other flush trigger).
  const batch: LogEvent[] = []
  const own = _buffers.get(key)
  if (own) {
    _buffers.delete(key)
    batch.push(...own)
  }
  if (key !== GLOBAL_BUCKET) {
    const global = _buffers.get(GLOBAL_BUCKET)
    if (global) {
      _buffers.delete(GLOBAL_BUCKET)
      batch.push(...global)
    }
  }
  if (batch.length === 0) return

  const fallbackUserId = typeof ctx?.userId === "string" ? ctx.userId : undefined

  try {
    await recordApplicationLogs(batch.map((e) => toRecord(e, fallbackUserId)))
  } catch (err) {
    // Do NOT route this through the logger: that would recurse into this
    // same sink. Console only; the message is sanitized and secret-free.
    const message = err instanceof Error ? err.message : "db log sink error"
    console.error(
      JSON.stringify({
        event: "db_log_sink.flush.failed",
        error: message.slice(0, 200),
        eventCount: batch.length,
      }),
    )
  }
}

/** Test-only: reset all sink state (unregister + clear buffers). */
export function _resetDbSinkForTests(): void {
  _registered = false
  _buffers = new Map()
}
