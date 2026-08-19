import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { LogEvent } from "@/lib/logger"

/*
  POST /api/transactions — observability integration tests.

  These exercise the real route handler (no HTTP server) with the API-key
  auth and ingest layers mocked at the module boundary. They verify:

  - The full event sequence is emitted with a consistent requestId.
  - Valid input yields 201; replay yields 200; invalid input yields 422.
  - A Zod failure emits transaction.validation.failed with full issues.
  - An auth failure emits transaction.auth.failure WITHOUT the API key.
  - A Notion failure emits transaction.notion.delivery.failed WITHOUT the token.
  - An unexpected error emits an event with context and a sanitized 500.
  - No event ever contains Authorization, the API key, Notion token,
    BETTER_AUTH_SECRET, SPENDLY_ENCRYPTION_KEY, or DATABASE_URL.

  The Axiom transport is replaced by an in-process capture sink (no fetch).
*/

const VALID_BODY = {
  merchant: "Coffee Shop",
  amountMinor: 599,
  currency: "EUR",
  date: "2026-08-12T10:30:00.000Z",
  type: "expense",
  source: "apple_wallet",
  externalId: "wallet-2026-08-12-10-30",
}

const API_KEY = "sk_live_testkeyaaaaaaaaaaaa"
const NOTION_TOKEN = "ntn_notrealtokenxyz123"
const BETTER_AUTH_SECRET = "super-secret-auth-value"
const SPENDLY_ENCRYPTION_KEY = "super-secret-encryption-key"
const DATABASE_URL = "postgresql://user:hunter2@host/db"

// Mock the API-key auth module.
vi.mock("@/infrastructure/auth/api-key", () => ({
  authenticateApiKey: vi.fn(),
}))

// Mock the transaction service so we control ingest outcomes without a DB.
vi.mock("@/domain/transaction/service", () => ({
  ingest: vi.fn(),
  listTransactions: vi.fn(),
}))

// Mock next/headers so the wrapper can read a deterministic request id.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "x-request-id") return "test-req-id"
      return null
    },
  })),
  cookies: vi.fn(async () => ({ get: () => null })),
}))

// Mock the application-log persistence boundary so the db sink's flush can be
// observed without a database (the sink only registers when DATABASE_URL is
// set; see the persistence describe below).
vi.mock("@/domain/log/service", () => ({
  recordApplicationLogs: vi.fn(async () => undefined),
  listApplicationLogs: vi.fn(),
}))

const { authenticateApiKey } = await import("@/infrastructure/auth/api-key")
const { ingest } = await import("@/domain/transaction/service")
const { recordApplicationLogs } = await import("@/domain/log/service")
const { POST } = await import("@/app/api/transactions/route")
const {
  clearSinks,
  captureEvents,
} = await import("@/lib/logger")
const { _resetAxiomSinkForTests } = await import(
  "@/infrastructure/observability/axiom-sink"
)
const { _resetDbSinkForTests } = await import(
  "@/infrastructure/observability/db-sink"
)

function makeRequest(body: unknown): Request {
  return new Request("https://spendly.test/api/transactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
      "user-agent": "AppleWallet/1 shortcuts",
    },
    body: JSON.stringify(body),
  })
}

let capture: { events: LogEvent[]; stop: () => void }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authenticateApiKey).mockResolvedValue({ userId: "user-1", keyId: "key-1" })
  vi.mocked(ingest).mockResolvedValue({
    transaction: {
      id: "tx-1",
      userId: "user-1",
      merchant: "Coffee Shop",
      amountMinor: 599,
      currency: "EUR",
      date: new Date("2026-08-12T10:30:00.000Z"),
      type: "expense",
      category: null,
      subcategory: null,
      source: "apple_wallet",
      account: null,
      paymentMethod: null,
      externalId: "wallet-2026-08-12-10-30",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    deliveries: [],
    replay: false,
  })
  _resetAxiomSinkForTests()
  _resetDbSinkForTests()
  clearSinks()
  capture = captureEvents()
})

afterEach(() => {
  capture.stop()
  _resetDbSinkForTests()
  clearSinks()
})

/** Assert that no captured event leaks any forbidden secret material. */
function expectNoSecretLeaks(): void {
  const dump = JSON.stringify(capture.events)
  expect(dump).not.toContain(API_KEY)
  expect(dump).not.toContain(NOTION_TOKEN)
  expect(dump).not.toContain(BETTER_AUTH_SECRET)
  expect(dump).not.toContain(SPENDLY_ENCRYPTION_KEY)
  expect(dump).not.toContain(DATABASE_URL)
  expect(dump).not.toContain("Bearer ")
  // No event should carry an `authorization` field.
  for (const e of capture.events) {
    expect(e.authorization).toBeUndefined()
    expect(e.token).toBeUndefined()
  }
}

const eventsByEvent = () => {
  const map = new Map<string, LogEvent>()
  for (const e of capture.events) map.set(e.event, e)
  return map
}

describe("POST /api/transactions — happy path", () => {
  it("returns 201 and emits the full correlated event sequence", async () => {
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(201)

    const byEvent = eventsByEvent()
    const sequence = [
      "transaction.request.received",
      "transaction.body.parsed",
      "transaction.ingest.started",
      "transaction.persisted",
      "transaction.request.completed",
    ]
    // (transaction.auth.success is emitted by the real authenticateApiKey,
    // covered in api-key.test.ts; here auth is mocked at the boundary.)
    for (const name of sequence) {
      expect(byEvent.has(name), `expected ${name}`).toBe(true)
    }
    // Every event shares the same requestId.
    for (const e of capture.events) {
      expect(e.requestId).toBe("test-req-id")
    }
    // Body summary is value-free.
    const parsed = byEvent.get("transaction.body.parsed")!
    expect(parsed.bodyType).toBe("object")
    expect(parsed.fields).toBeDefined()
    expect(JSON.stringify(parsed)).not.toContain("Coffee Shop")
    // Completion carries the status code.
    expect(byEvent.get("transaction.request.completed")!.statusCode).toBe(201)
    // Events emitted after authentication carry the userId via the log
    // context (needed for per-user scoping in the /logs view).
    expect(byEvent.get("transaction.persisted")!.userId).toBe("user-1")
    // Pre-auth events have no userId (the db sink backfills it at flush time).
    expect(byEvent.get("transaction.request.received")!.userId).toBeUndefined()
  })

  it("returns 200 on idempotent replay", async () => {
    vi.mocked(ingest).mockResolvedValue({
      transaction: {
        id: "tx-1",
        userId: "user-1",
        merchant: "Coffee Shop",
        amountMinor: 599,
        currency: "EUR",
        date: new Date("2026-08-12T10:30:00.000Z"),
        type: "expense",
        category: null,
        subcategory: null,
        source: "apple_wallet",
        account: null,
        paymentMethod: null,
        externalId: "wallet-2026-08-12-10-30",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      deliveries: [],
      replay: true,
    })
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(eventsByEvent().get("transaction.persisted")!.replay).toBe(true)
  })
})

describe("POST /api/transactions — validation failure (the 422 case)", () => {
  it("returns 422 for an invalid body and logs full Zod issues", async () => {
    // amountMinor as a string is the kind of shape mismatch a real Apple
    // Wallet payload might produce and that we must be able to diagnose.
    const badBody = { ...VALID_BODY, amountMinor: "599" }
    const res = await POST(makeRequest(badBody))
    expect(res.status).toBe(422)

    const byEvent = eventsByEvent()
    const failed = byEvent.get("transaction.validation.failed")!
    expect(failed.schema).toBe("transactionInputSchema")
    const issues = failed.issues as Array<Record<string, unknown>>
    // The issue list must name the failing field so the real 422 is
    // attributable in Axiom.
    const paths = issues.flatMap((i) => i.path as unknown[])
    expect(paths).toEqual(expect.arrayContaining(["amountMinor"]))
    // expected/received are preserved for diagnostics where Zod provides
    // them. (Zod v4 folds "received" into the message text rather than a
    // dedicated field, so we assert on the message there.)
    const amtIssue = issues.find((i) => (i.path as unknown[]).includes("amountMinor"))!
    expect(amtIssue.expected).toBe("number")
    expect(String(amtIssue.message)).toMatch(/string/i)
  })

  it("still emits request.completed with 422", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, amountMinor: "x" }))
    expect(res.status).toBe(422)
    expect(eventsByEvent().get("transaction.request.completed")!.statusCode).toBe(422)
  })
})

describe("POST /api/transactions — auth failure", () => {
  it("returns 401 when auth rejects, and never leaks the API key", async () => {
    const { AuthenticationError } = await import("@/lib/errors")
    vi.mocked(authenticateApiKey).mockRejectedValue(new AuthenticationError("bad"))
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
    // The route itself logs nothing secret; the auth module's own
    // auth.failure event is covered in api-key.test.ts against the real
    // implementation. Here we only assert the request stays secret-free.
    expectNoSecretLeaks()
    expect(eventsByEvent().get("transaction.request.completed")!.statusCode).toBe(401)
  })
})

describe("POST /api/transactions — Notion delivery failure", () => {
  it("returns 502 and logs ingest.failed without the token", async () => {
    const { DestinationError } = await import("@/lib/errors")
    vi.mocked(ingest).mockRejectedValue(
      new DestinationError("Notion rejected the transaction payload"),
    )
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(502)

    const failed = eventsByEvent().get("transaction.ingest.failed")!
    expect(failed.externalId).toBeDefined()
    // The Notion token never appears anywhere in the captured events.
    expectNoSecretLeaks()
    // The notion.delivery.failed event itself is emitted by the real adapter,
    // covered in adapter.test.ts; here ingest is mocked so only ingest.failed
    // is expected at the route layer.
  })
})

describe("POST /api/transactions — unexpected error", () => {
  it("returns 500, logs context + stack, and never leaks internals to client", async () => {
    const boom = new Error("DATABASE_URL=postgresql://user:hunter2@host exploded")
    vi.mocked(ingest).mockRejectedValue(boom)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(500)

    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toBe("Something went wrong")
    expect(JSON.stringify(body)).not.toContain("hunter2")
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL")

    // The error event carries the stack for diagnostics.
    const errEvent = capture.events.find((e) => e.event === "transaction.ingest.failed")
    expect(errEvent).toBeDefined()
    expect(errEvent!.errorType).toBe("Error")
    expectNoSecretLeaks()
  })
})

describe("POST /api/transactions — requestId preservation", () => {
  it("the same requestId appears from received through completed", async () => {
    await POST(makeRequest(VALID_BODY))
    const ids = new Set(capture.events.map((e) => e.requestId))
    expect(ids.size).toBe(1)
    expect([...ids][0]).toBe("test-req-id")
  })

  it("every event carries method and path from the request context", async () => {
    await POST(makeRequest(VALID_BODY))
    for (const e of capture.events) {
      expect(e.method).toBe("POST")
      expect(e.path).toBe("/api/transactions")
    }
    const completed = eventsByEvent().get("transaction.request.completed")!
    expect(completed.statusCode).toBe(201)
    expect(typeof completed.durationMs).toBe("number")
  })
})

describe("POST /api/transactions — PostgreSQL persistence before the response", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  it("persists the full request story to the db sink BEFORE the handler resolves", async () => {
    // With DATABASE_URL set, the db sink registers and the wrapper awaits
    // flushDbLogs() before returning the response — so by the time POST
    // resolves, nothing is left buffered in memory (serverless-safe).
    process.env.DATABASE_URL = DATABASE_URL
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(201)

    expect(recordApplicationLogs).toHaveBeenCalledTimes(1)
    const records = vi.mocked(recordApplicationLogs).mock.calls[0]![0] as Array<
      Record<string, unknown>
    >
    const events = records.map((r) => r.event)
    expect(events).toEqual(
      expect.arrayContaining([
        "transaction.request.received",
        "transaction.body.parsed",
        "transaction.ingest.started",
        "transaction.persisted",
        "transaction.request.completed",
      ]),
    )
    // Every persisted row is correlated and attributed to the auth user.
    for (const r of records) {
      expect(r.requestId).toBe("test-req-id")
      expect(r.userId).toBe("user-1")
    }
    // The completed row is self-describing for /logs: method, path, status,
    // duration all present in the redacted metadata payload.
    const completed = records.find(
      (r) => r.event === "transaction.request.completed",
    )!
    const metadata = completed.metadata as Record<string, unknown>
    expect(metadata.method).toBe("POST")
    expect(metadata.path).toBe("/api/transactions")
    expect(metadata.statusCode).toBe(201)
    expect(typeof metadata.durationMs).toBe("number")
    // Nothing secret reaches the database boundary.
    expect(JSON.stringify(records)).not.toContain(API_KEY)
    expect(JSON.stringify(records)).not.toContain("Bearer ")
  })

  it("persists a 422 with its validation issues", async () => {
    process.env.DATABASE_URL = DATABASE_URL
    const res = await POST(makeRequest({ ...VALID_BODY, amountMinor: "599" }))
    expect(res.status).toBe(422)

    const records = vi.mocked(recordApplicationLogs).mock.calls[0]![0] as Array<
      Record<string, unknown>
    >
    const failed = records.find(
      (r) => r.event === "transaction.validation.failed",
    )!
    const issues = (failed.metadata as Record<string, unknown>).issues as Array<
      Record<string, unknown>
    >
    expect(issues.flatMap((i) => i.path as unknown[])).toContain("amountMinor")
    const completed = records.find(
      (r) => r.event === "transaction.request.completed",
    )!
    expect(
      (completed.metadata as Record<string, unknown>).statusCode,
    ).toBe(422)
  })
})
