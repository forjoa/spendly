import "server-only"
import { registerSink, type LogEvent, type LogContext, getLogContext } from "@/lib/logger"

/**
 * Axiom log sink (server-only).
 *
 * Sends structured events to Axiom via the official REST ingest endpoint:
 *   POST {AXIOM_URL}/v1/datasets/{AXIOM_DATASET}/ingest
 *   Authorization: Bearer {AXIOM_TOKEN}
 *   Content-Type: application/x-ndjson
 *
 * This is the zero-dependency integration path: no SDK is required, the
 * transport is a single `fetch`, and it is fully mockable in tests (mock
 * global `fetch`). It is appropriate for Spendly's V0 debugging needs and
 * stays within the Axiom free tier.
 *
 * Required environment variables (configure in Vercel Project Settings →
 * Environment Variables; see .env.example and docs/observability.md):
 *   AXIOM_DATASET — the Axiom dataset name (e.g. "spendly-prod")
 *   AXIOM_TOKEN   — an Axiom API token with Ingest permission on that dataset
 *
 * Optional:
 *   AXIOM_URL     — ingest base URL. Defaults to https://api.axiom.co.
 *                   Override only for Axiom Cloud regional/private endpoints.
 *
 * If either required variable is missing, the sink is not registered and the
 * console sink alone carries events (so local dev and CI keep working
 * without Axiom configured). The token is read at ingest time from
 * process.env and is NEVER placed into a log event.
 */

const DEFAULT_AXIOM_URL = "https://api.axiom.co"
const INGEST_PATH = "/v1/datasets"
const FLUSH_CONCURRENCY = 4

interface AxiomConfig {
  url: string
  dataset: string
  token: string
}

let _registered = false

/** Buffer of events awaiting the next flush. */
let _buffer: LogEvent[] = []

function readConfig(): AxiomConfig | undefined {
  const dataset = process.env.AXIOM_DATASET
  const token = process.env.AXIOM_TOKEN
  if (!dataset || !token) return undefined
  const url = (process.env.AXIOM_URL ?? DEFAULT_AXIOM_URL).replace(/\/$/, "")
  return { url, dataset, token }
}

/**
 * Lazily register the Axiom sink once, on first server use. Safe to call
 * repeatedly; no-ops if Axiom is unconfigured or already registered.
 */
export function ensureAxiomSink(): void {
  if (_registered) return
  const config = readConfig()
  if (!config) {
    // Axiom not configured — fall back to console-only. This keeps local dev
    // and `next build` working without secrets.
    _registered = true
    return
  }
  registerSink(append)
  _registered = true
}

function append(event: LogEvent): void {
  _buffer.push(event)
}

/**
 * Flush buffered events to Axiom. Called by the request wrapper after the
 * response is produced (in `finally`). Best-effort and never throws; a flush
 * failure is reported only to the console sink (it cannot recurse into Axiom).
 *
 * Events are flushed in small batches to respect Axiom's per-request limits.
 */
export async function flushAxiom(): Promise<void> {
  if (!_registered) return
  const config = readConfig()
  if (!config) return
  if (_buffer.length === 0) return

  // Drain the buffer atomically so concurrent flushes don't duplicate events.
  const events = _buffer
  _buffer = []

  await sendInBatches(config, events)
}

async function sendInBatches(config: AxiomConfig, events: LogEvent[]): Promise<void> {
  const BATCH_SIZE = 100
  const batches: LogEvent[][] = []
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    batches.push(events.slice(i, i + BATCH_SIZE))
  }

  // Limited concurrency to avoid spawning unbounded fetches for a single flush.
  let cursor = 0
  const workers: Promise<void>[] = []
  const next = (): Promise<void> | undefined => {
    const idx = cursor++
    if (idx >= batches.length) return undefined
    return sendOneBatch(config, batches[idx]!).then(() => {
      const more = next()
      return more ?? Promise.resolve()
    })
  }
  for (let i = 0; i < Math.min(FLUSH_CONCURRENCY, batches.length); i++) {
    const w = next()
    if (w) workers.push(w)
  }
  await Promise.allSettled(workers)
}

async function sendOneBatch(config: AxiomConfig, events: LogEvent[]): Promise<void> {
  const url = `${config.url}${INGEST_PATH}/${encodeURIComponent(config.dataset)}/ingest`
  // Axiom accepts NDJSON (one JSON object per line).
  const body = events.map((e) => JSON.stringify(e)).join("\n")

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/x-ndjson",
      },
      body,
    })
    if (!res.ok) {
      // Never log the token. Surface only the status and a sanitized hint.
      console.error(
        JSON.stringify({
          event: "axiom.ingest.failed",
          statusCode: res.status,
          statusText: res.statusText,
          eventCount: events.length,
        }),
      )
    }
  } catch (err) {
    // Network/transport error. Never expose secret material; the token is not
    // part of the error message.
    const message =
      err instanceof Error ? err.message : "axiom ingest transport error"
    console.error(
      JSON.stringify({
        event: "axiom.ingest.error",
        error: message.slice(0, 200),
        eventCount: events.length,
      }),
    )
  }
}

/**
 * Attach the current request id to an Axiom-correlatable context. This is a
 * convenience for code that wants to read the active request id without
 * importing the logger directly.
 */
export function currentRequestId(): string | undefined {
  return getLogContext()?.requestId
}

/** Test-only: reset all Axiom sink state (unregister + clear buffer). */
export function _resetAxiomSinkForTests(): void {
  _registered = false
  _buffer = []
}

/** Exported for tests so they can read the live config resolution. */
export function _readAxiomConfigForTests(): AxiomConfig | undefined {
  return readConfig()
}

export type { LogEvent, LogContext }
