import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { LogEvent } from "@/lib/logger"

/*
  authenticateApiKey — observability tests against the real implementation.

  The DB client and next/headers are mocked at the boundary so we exercise
  the real auth logic (format check, hash lookup, success/failure logging)
  without a database. These verify the auth.success / auth.failure events
  are emitted with the correct reason category and that the API key value,
  Authorization header, and stored hash are NEVER logged.
*/

// Deterministic mock for the db client. `db.select().from().where().limit()`
// returns the configured rows; `.update().set().where()` is a no-op chain.
function makeDbMock(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => rows),
  }
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(async () => undefined),
  }
  return {
    select: vi.fn(() => chain),
    update: vi.fn(() => updateChain),
  }
}

let dbRows: unknown[] = []
const dbMock = makeDbMock([])

vi.mock("@/infrastructure/db/client", () => ({
  get db() {
    return dbMock
  },
  schema: { apiKeys: { keyHash: "keyHash", revokedAt: "revokedAt", id: "id" } },
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "authorization") return currentAuthHeader
      return null
    },
  })),
}))

const { authenticateApiKey } = await import("@/infrastructure/auth/api-key")
const { clearSinks, captureEvents } = await import("@/lib/logger")
const { hashKey } = await import("@/lib/keys")

const REAL_KEY = "sk_live_testkeyaaaaaaaaaaaa"
const NOTION_TOKEN = "ntn_shouldnotappear"

let currentAuthHeader: string | null = null
let capture: ReturnType<typeof captureEvents>

beforeEach(() => {
  clearSinks()
  capture = captureEvents()
  currentAuthHeader = null
  dbRows = []
  // Re-wire the mock's limit() to the live dbRows array.
  const chain = dbMock.select()
  chain.limit.mockImplementation(async () => dbRows)
})

afterEach(() => {
  capture.stop()
  clearSinks()
})

function setHeader(value: string | null) {
  currentAuthHeader = value
}

async function seedValidKey(): Promise<void> {
  const hash = await hashKey(REAL_KEY)
  dbRows = [{ id: "key-1", userId: "user-1", keyHash: hash }]
}

function assertNoSecretLeaks(events: LogEvent[]): void {
  const dump = JSON.stringify(events)
  expect(dump).not.toContain(REAL_KEY)
  expect(dump).not.toContain(NOTION_TOKEN)
  expect(dump).not.toContain("Bearer")
  for (const e of events) {
    expect(e.authorization).toBeUndefined()
    expect(e.token).toBeUndefined()
    expect(e.keyHash).toBeUndefined()
  }
}

describe("authenticateApiKey — success", () => {
  it("returns userId/keyId and emits auth.success without the key", async () => {
    await seedValidKey()
    setHeader(`Bearer ${REAL_KEY}`)
    const result = await authenticateApiKey()
    expect(result).toEqual({ userId: "user-1", keyId: "key-1" })

    const success = capture.events.find((e) => e.event === "transaction.auth.success")!
    expect(success.userId).toBe("user-1")
    expect(success.keyId).toBe("key-1")
    assertNoSecretLeaks(capture.events)
  })
})

describe("authenticateApiKey — failures", () => {
  it("missing header -> auth.failure reason=missing-header, 401-mapped", async () => {
    setHeader(null)
    await expect(authenticateApiKey()).rejects.toThrow(/Missing/)
    const failed = capture.events.find((e) => e.event === "transaction.auth.failure")!
    expect(failed.reason).toBe("missing-header")
    assertNoSecretLeaks(capture.events)
  })

  it("malformed header -> auth.failure reason=missing-header", async () => {
    setHeader("Token abc")
    await expect(authenticateApiKey()).rejects.toThrow(/Missing/)
    const failed = capture.events.find((e) => e.event === "transaction.auth.failure")!
    expect(failed.reason).toBe("missing-header")
  })

  it("bad key format -> auth.failure reason=bad-format", async () => {
    setHeader("Bearer not-a-real-key")
    await expect(authenticateApiKey()).rejects.toThrow(/format/i)
    const failed = capture.events.find((e) => e.event === "transaction.auth.failure")!
    expect(failed.reason).toBe("bad-format")
    assertNoSecretLeaks(capture.events)
  })

  it("unknown key -> auth.failure reason=not-found", async () => {
    dbRows = [] // no matching hash
    setHeader(`Bearer ${REAL_KEY}`)
    await expect(authenticateApiKey()).rejects.toThrow(/not found/i)
    const failed = capture.events.find((e) => e.event === "transaction.auth.failure")!
    expect(failed.reason).toBe("not-found")
    assertNoSecretLeaks(capture.events)
  })

  it("revoked key -> auth.failure reason=not-found", async () => {
    // Revoked keys are filtered out by the query (revokedAt IS NULL), so the
    // mock returns no rows -> not-found.
    dbRows = []
    setHeader(`Bearer ${REAL_KEY}`)
    await expect(authenticateApiKey()).rejects.toThrow(/not found/i)
    const failed = capture.events.find((e) => e.event === "transaction.auth.failure")!
    expect(failed.reason).toBe("not-found")
  })
})
