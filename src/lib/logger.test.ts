import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  log,
  registerSink,
  clearSinks,
  captureEvents,
  runWithLogContext,
  newRequestId,
  type LogEvent,
} from "./logger"

/*
  Structured logger tests.

  Covers: request-context correlation, redaction of known secret shapes and
  sensitive keys, fail-safe serialization, and sink behavior. No real Axiom
  transport is exercised here — sinks are in-process capture arrays.
*/

let capture: { events: LogEvent[]; stop: () => void }

beforeEach(() => {
  // Drop the default console sink so tests don't print to stderr and so the
  // only sink is the explicit capture sink.
  clearSinks()
  capture = captureEvents()
})

afterEach(() => {
  capture.stop()
})

describe("request correlation", () => {
  it("attaches requestId from the active context to every event", async () => {
    const requestId = newRequestId()
    await runWithLogContext({ requestId }, async () => {
      log.info("a")
      log.warn("b")
      log.error("c")
    })
    expect(capture.events).toHaveLength(3)
    for (const e of capture.events) {
      expect(e.requestId).toBe(requestId)
    }
  })

  it("preserves requestId across awaited async boundaries", async () => {
    const requestId = "req-xyz"
    await runWithLogContext({ requestId }, async () => {
      await Promise.resolve()
      log.info("after-await")
      await new Promise((r) => setTimeout(r, 1))
      log.info("after-timeout")
    })
    expect(capture.events.every((e) => e.requestId === requestId)).toBe(true)
  })

  it("does not attach requestId when no context is active", () => {
    log.info("no-context")
    const e = capture.events[0]!
    expect(e.requestId).toBeUndefined()
  })

  it("lets explicit fields extend (not clobber) context base", async () => {
    await runWithLogContext({ requestId: "r1", path: "/api/transactions" }, () => {
      log.info("e", { extra: "value" })
    })
    const e = capture.events[0]!
    expect(e.requestId).toBe("r1")
    expect(e.path).toBe("/api/transactions")
    expect(e.extra).toBe("value")
  })
})

describe("structured event shape", () => {
  it("emits timestamp, level, and event fields", () => {
    log.info("my.event", { foo: 1 })
    const e = capture.events[0]!
    expect(e.event).toBe("my.event")
    expect(e.level).toBe("info")
    expect(typeof e.timestamp).toBe("string")
    expect(new Date(e.timestamp).toString()).not.toBe("Invalid Date")
    expect(e.foo).toBe(1)
  })
})

describe("redaction — sensitive keys", () => {
  it("redacts known sensitive keys regardless of casing", () => {
    // Use non-secret-shaped values so only KEY-based redaction is exercised
    // (value-shape scrubbing is covered separately).
    log.info("x", {
      authorization: "somevalue",
      Authorization: "somevalue",
      apiKey: "somevalue",
      api_key: "somevalue",
      token: "somevalue",
      secret: "somevalue",
      password: "somevalue",
      cookie: "somevalue",
      session: "somevalue",
      credential: "somevalue",
      databaseUrl: "somevalue",
      DATABASE_URL: "somevalue",
      BETTER_AUTH_SECRET: "somevalue",
      SPENDLY_ENCRYPTION_KEY: "somevalue",
      accessToken: "somevalue",
      auth_token: "somevalue",
      merchant: "kept-merchant",
      transactionId: "kept-tx-id",
      itemCount: 5,
    })
    const e = capture.events[0]!
    expect(e.authorization).toBe("[REDACTED]")
    expect(e.Authorization).toBe("[REDACTED]")
    expect(e.apiKey).toBe("[REDACTED]")
    expect(e.api_key).toBe("[REDACTED]")
    expect(e.token).toBe("[REDACTED]")
    expect(e.secret).toBe("[REDACTED]")
    expect(e.password).toBe("[REDACTED]")
    expect(e.cookie).toBe("[REDACTED]")
    expect(e.session).toBe("[REDACTED]")
    expect(e.credential).toBe("[REDACTED]")
    expect(e.databaseUrl).toBe("[REDACTED]")
    expect(e.DATABASE_URL).toBe("[REDACTED]")
    expect(e.BETTER_AUTH_SECRET).toBe("[REDACTED]")
    expect(e.SPENDLY_ENCRYPTION_KEY).toBe("[REDACTED]")
    expect(e.accessToken).toBe("[REDACTED]")
    expect(e.auth_token).toBe("[REDACTED]")
    // Normal domain keys are preserved.
    expect(e.merchant).toBe("kept-merchant")
    expect(e.transactionId).toBe("kept-tx-id")
    expect(e.itemCount).toBe(5)
  })
})

describe("redaction — secret string shapes scrubbed anywhere", () => {
  it("scrubs Spendly API keys embedded in messages and nested strings", () => {
    log.info("e", {
      message: "failed for key sk_live_AbC123_-xyz and again sk_live_xyz",
      nested: { value: "token=sk_live_qwerty" },
    })
    const e = capture.events[0]!
    expect(JSON.stringify(e)).not.toContain("sk_live_AbC123")
    expect(JSON.stringify(e)).not.toContain("sk_live_qwerty")
    expect(JSON.stringify(e)).toContain("[REDACTED_KEY]")
  })

  it("scrubs Notion tokens (ntn_ and legacy secret_<32hex>)", () => {
    log.info("e", {
      msg: "notion token ntn_abcDEF123 rejected",
      legacy: "secret_0123456789abcdef0123456789abcdef",
    })
    const e = capture.events[0]!
    expect(JSON.stringify(e)).not.toContain("ntn_abcDEF123")
    expect(JSON.stringify(e)).not.toContain("secret_0123456789abcdef0123456789abcdef")
    expect(JSON.stringify(e)).toContain("[REDACTED_TOKEN]")
  })

  it("does NOT redact benign strings resembling 'secret_'", () => {
    log.info("e", { merchant: "secret_garden cafe" })
    const e = capture.events[0]!
    expect(e.merchant).toBe("secret_garden cafe")
  })

  it("scrubs Bearer tokens in inline strings", () => {
    log.info("e", { detail: "header was Bearer abc123.def_xyz" })
    const e = capture.events[0]!
    expect(JSON.stringify(e)).not.toContain("abc123.def_xyz")
    expect(JSON.stringify(e)).toContain("Bearer [REDACTED]")
  })
})

describe("redaction — Error objects", () => {
  it("keeps name/message/stack but scrubs secrets within them", () => {
    const err = new Error("boom sk_live_secretvalue in stack")
    log.error("e", { error: err })
    const e = capture.events[0]!
    expect((e.error as { name: string }).name).toBe("Error")
    expect(JSON.stringify(e)).not.toContain("sk_live_secretvalue")
  })
})

describe("fail-safety", () => {
  it("serializes circular references without throwing", () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    log.info("e", { value: circular })
    const e = capture.events[0]!
    // The outer object is preserved; only the cycle is replaced.
    expect((e.value as { a: number }).a).toBe(1)
    expect((e.value as { self: string }).self).toBe("[CIRCULAR]")
  })

  it("a throwing sink is dropped and does not break logging", () => {
    clearSinks()
    const good: LogEvent[] = []
    registerSink(() => {
      throw new Error("sink exploded")
    })
    registerSink((e) => good.push(e))
    expect(() => log.info("e", { x: 1 })).not.toThrow()
    expect(good.length).toBe(1)
  })
})
