/**
 * Structured logger for Spendly.
 *
 * Design goals (see docs/observability.md):
 * - Framework-agnostic. No Next.js/React/Drizzle/Notion imports. Safe to use
 *   from the domain layer. Lives in `src/lib` because it is a shared technical
 *   utility, not business logic.
 * - Request correlation via AsyncLocalStorage: a single `runWithLogContext`
 *   at the request boundary attaches a `requestId` that every downstream
 *   log (auth → validation → ingest → db → notion → response) inherits, with
 *   no need to thread a logger object through the domain.
 * - Pluggable sinks: the console sink always runs; an Axiom sink
 *   (infrastructure) is registered lazily in server contexts. Tests capture
 *   events by registering a sink.
 * - Defense-in-depth redaction. Sensitive keys are always masked, and known
 *   secret string shapes (API keys, Notion tokens, Bearer headers) are scrubbed
 *   from any string value. Logging never throws.
 *
 * What is deliberately NEVER logged (enforced by redaction + convention):
 * API keys, Authorization headers, Notion integration tokens, Notion API
 * version tokens, BETTER_AUTH_SECRET, SPENDLY_ENCRYPTION_KEY, DATABASE_URL,
 * cookies, passwords, sessions, raw decrypted credentials, full header dumps.
 */

import { webcrypto } from "node:crypto"
import { AsyncLocalStorage } from "node:async_hooks"

export type LogLevel = "info" | "warn" | "error"

/** A single structured event as emitted to sinks. */
export interface LogEvent {
  timestamp: string
  level: LogLevel
  event: string
  requestId?: string
  [key: string]: unknown
}

/** Context attached for the lifetime of a request (via AsyncLocalStorage). */
export interface LogContext {
  requestId: string
  [key: string]: unknown
}

/** A sink receives serialized, redacted events. Never throws. */
export type LogSink = (event: LogEvent) => void

// ── sensitive-field redaction ──────────────────────────────────────────

/**
 * Keys whose values must never be logged. Matched case-insensitively against
 * whole words / common compound forms in the key, NOT bare substrings — so
 * `notSecret` (contains "secret") is NOT redacted, while `apiSecret`,
 * `authToken`, and `databaseUrl` are. A key is sensitive if any fragment
 * appears as a whole word (delimited by non-alphanumeric) OR as the suffix of
 * a camelCase/snake/kebab compound (e.g. `accessToken`, `access_token`,
 * `auth-secret`).
 */
const SENSITIVE_KEY_FRAGMENTS = [
  "authorization",
  "apikey",
  "token",
  "secret",
  "password",
  "cookie",
  "session",
  "credential",
  "encryptionkey",
  "databaseurl",
  "connectionstring",
  "privatekey",
]

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  // Split on non-alphanumeric boundaries to get whole words.
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean)
  const wordSet = new Set(words)
  // The concatenated form (e.g. "api_key" -> "apikey") so fragment matching
  // works across snake/kebab boundaries.
  const joined = words.join("")
  // Also build the set of camelCase tail segments (e.g. accessToken -> token).
  const tails = new Set<string>()
  for (const word of words) {
    // For each camelCase boundary inside a word, capture the suffix.
    for (let i = 0; i < word.length; i++) {
      if (i > 0 && word[i] === word[i]!.toUpperCase()) {
        tails.add(word.slice(i).toLowerCase())
      }
    }
    tails.add(word)
  }
  return SENSITIVE_KEY_FRAGMENTS.some(
    (frag) => wordSet.has(frag) || tails.has(frag) || joined.includes(frag),
  )
}

/**
 * Known secret string shapes that must be scrubbed from any string value,
 * even when the surrounding key is not obviously sensitive (defense in
 * depth). Order matters: check the longer/more specific patterns first.
 */
const SECRET_VALUE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Spendly API keys: sk_live_<base64url>
  { regex: /sk_live_[A-Za-z0-9_-]+/g, replacement: "[REDACTED_KEY]" },
  // Notion integration tokens: modern ntn_<...>, legacy secret_<32+ hex>.
  // The legacy `secret_` pattern is anchored to 32+ hex chars so a merchant
  // name like "secret_garden" is never accidentally redacted.
  { regex: /ntn_[A-Za-z0-9_-]+/g, replacement: "[REDACTED_TOKEN]" },
  { regex: /secret_[A-Fa-f0-9]{32,}/g, replacement: "[REDACTED_TOKEN]" },
  // Bearer tokens in inline strings: Bearer <anything>
  { regex: /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]+/g, replacement: "Bearer [REDACTED]" },
]

const REDACTED = "[REDACTED]"

/**
 * Deep-clone and redact a value. The input is never mutated. Cycles are
 * guarded by a seen-Set. Unknown shapes fall back to a safe placeholder
 * rather than throwing.
 */
function redact(value: unknown, seen: Set<unknown>): unknown {
  if (value === null || value === undefined) return value

  if (typeof value === "string") {
    return scrubSecretStrings(value)
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (typeof value === "symbol" || typeof value === "function") {
    return undefined
  }

  if (value instanceof Error) {
    // Keep name/message/stack; these are diagnostics, not secrets. Values are
    // still passed through string scrubbing via the string branch above.
    return {
      name: value.name,
      message: scrubSecretStrings(value.message),
      stack: value.stack ? scrubSecretStrings(value.stack) : undefined,
    }
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]"
    seen.add(value)
    try {
      if (Array.isArray(value)) {
        return value.map((item) => redact(item, seen))
      }
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (isSensitiveKey(k)) {
          out[k] = REDACTED
        } else {
          out[k] = redact(v, seen)
        }
      }
      return out
    } finally {
      seen.delete(value)
    }
  }

  return undefined
}

function scrubSecretStrings(input: string): string {
  let out = input
  for (const { regex, replacement } of SECRET_VALUE_PATTERNS) {
    out = out.replace(regex, replacement)
  }
  return out
}

// ── request context ─────────────────────────────────────────────────────

const requestContext = new AsyncLocalStorage<LogContext>()

/**
 * Run `fn` inside a log context. Every `log.*` call within `fn` (including
 * awaited async work) inherits `context.requestId` and any base fields, so a
 * single request can be queried end-to-end in Axiom by `requestId`.
 */
export function runWithLogContext<T>(
  context: LogContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return requestContext.run(context, fn)
}

export function getLogContext(): LogContext | undefined {
  return requestContext.getStore()
}

/** Generate a fresh request id (crypto-strong). */
export function newRequestId(): string {
  return webcrypto.randomUUID()
}

// ── sinks ───────────────────────────────────────────────────────────────

const sinks = new Set<LogSink>()

/**
 * Register a sink. Returns an unregister function. Sinks must never throw;
 * if they do, the error is swallowed and the sink is removed to keep logging
 * fail-safe.
 */
export function registerSink(sink: LogSink): () => void {
  sinks.add(sink)
  return () => {
    sinks.delete(sink)
  }
}

export function clearSinks(): void {
  sinks.clear()
}

/** Test helper: capture emitted events into an array. */
export function captureEvents(): { events: LogEvent[]; stop: () => void } {
  const events: LogEvent[] = []
  const stop = registerSink((e) => events.push(e))
  return { events, stop }
}

// ── console sink (always on) ────────────────────────────────────────────

/**
 * Default console sink. Emits a single JSON line per event to stderr. JSON
 * form keeps Vercel's structured logs parseable; stderr avoids polluting
 * response bodies in edge cases.
 */
const consoleSink: LogSink = (event) => {
  const line = safeStringify(event)
  console.error(line)
}

// Register the console sink exactly once at module load.
sinks.add(consoleSink)

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    try {
      return JSON.stringify({ event: "log.serialize.failed" })
    } catch {
      return '{"event":"log.serialize.failed"}'
    }
  }
}

// ── public log API ──────────────────────────────────────────────────────

function emit(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  const ctx = requestContext.getStore()
  const payload: LogEvent = {
    timestamp: new Date().toISOString(),
    level,
    event,
    // Base context first so explicit fields can extend (but not clobber) requestId.
    ...(ctx ?? {}),
    ...(fields ?? {}),
  }
  // Guarantee requestId from context is present even if fields omitted it.
  if (ctx?.requestId && !payload.requestId) {
    payload.requestId = ctx.requestId
  }
  const redacted = redact(payload, new Set()) as LogEvent
  for (const sink of sinks) {
    try {
      sink(redacted)
    } catch {
      // A failing sink must never break the request. Drop it.
      sinks.delete(sink)
    }
  }
}

export const log = {
  info(event: string, fields?: Record<string, unknown>): void {
    emit("info", event, fields)
  },
  warn(event: string, fields?: Record<string, unknown>): void {
    emit("warn", event, fields)
  },
  error(event: string, fields?: Record<string, unknown>): void {
    emit("error", event, fields)
  },
}
