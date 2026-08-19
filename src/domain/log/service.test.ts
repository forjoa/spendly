import { describe, it, expect, beforeEach, vi } from "vitest"

/*
  Application log service tests.

  The repository (database boundary) is mocked at the module level. These
  tests verify record normalization for persistence and that every read is
  scoped by userId with validated filters and limit+1 pagination.
*/

vi.mock("@/domain/log/repository", () => ({
  insertMany: vi.fn(async () => undefined),
  listByUser: vi.fn(async () => []),
}))

const { insertMany, listByUser } = await import("@/domain/log/repository")
const { recordApplicationLogs, listApplicationLogs } = await import(
  "@/domain/log/service"
)
const { LOG_PAGE_SIZE, applicationLogQuerySchema } = await import("./schema")

const VALID_RECORD = {
  userId: "user-1",
  requestId: "req-1",
  transactionId: "3f6b9c12-6c6f-4c8c-9c1f-2b6b9c6f3f6b",
  level: "info",
  event: "transaction.persisted",
  message: undefined,
  metadata: { replay: false },
  timestamp: "2026-08-19T10:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("recordApplicationLogs", () => {
  it("maps valid records to insert rows with the event timestamp", async () => {
    await recordApplicationLogs([VALID_RECORD])
    expect(insertMany).toHaveBeenCalledTimes(1)
    const rows = vi.mocked(insertMany).mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: "user-1",
      requestId: "req-1",
      transactionId: VALID_RECORD.transactionId,
      level: "info",
      event: "transaction.persisted",
      metadata: { replay: false },
    })
    expect(rows[0]!.createdAt).toEqual(new Date("2026-08-19T10:00:00.000Z"))
  })

  it("drops malformed records individually instead of failing the batch", async () => {
    await recordApplicationLogs([
      VALID_RECORD,
      { level: "shout", event: "bad-level" },
      { level: "info" },
      "garbage",
      null,
    ])
    const rows = vi.mocked(insertMany).mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.event).toBe("transaction.persisted")
  })

  it("does not touch the database when every record is invalid", async () => {
    await recordApplicationLogs([{ nope: true }])
    expect(insertMany).not.toHaveBeenCalled()
  })

  it("defaults nullables and falls back to now when timestamp is absent", async () => {
    await recordApplicationLogs([{ level: "warn", event: "transaction.auth.failure" }])
    const rows = vi.mocked(insertMany).mock.calls[0]![0]
    expect(rows[0]).toMatchObject({
      userId: null,
      requestId: null,
      transactionId: null,
      message: null,
      metadata: null,
    })
    expect(rows[0]!.createdAt).toBeInstanceOf(Date)
  })
})

describe("listApplicationLogs", () => {
  it("always scopes the query by the given userId", async () => {
    await listApplicationLogs("user-1", {})
    expect(listByUser).toHaveBeenCalledTimes(1)
    const [userId] = vi.mocked(listByUser).mock.calls[0]!
    expect(userId).toBe("user-1")
  })

  it("applies validated filters", async () => {
    await listApplicationLogs("user-1", {
      level: "error",
      event: "transaction.validation.failed",
      requestId: "req-9",
      from: "2026-08-19T00:00",
      to: "2026-08-19T23:59",
      page: "2",
    })
    const [, filter] = vi.mocked(listByUser).mock.calls[0]!
    expect(filter.level).toBe("error")
    expect(filter.event).toBe("transaction.validation.failed")
    expect(filter.requestId).toBe("req-9")
    expect(filter.from).toEqual(new Date("2026-08-19T00:00"))
    expect(filter.to).toEqual(new Date("2026-08-19T23:59"))
    expect(filter.offset).toBe(LOG_PAGE_SIZE)
    expect(filter.limit).toBe(LOG_PAGE_SIZE + 1)
  })

  it("ignores invalid filter values instead of failing", async () => {
    const result = await listApplicationLogs("user-1", {
      level: "shout",
      page: "-4",
    })
    const [, filter] = vi.mocked(listByUser).mock.calls[0]!
    expect(filter.level).toBeUndefined()
    expect(filter.offset).toBe(0)
    expect(result.page).toBe(1)
  })

  it("computes hasMore via the limit+1 probe", async () => {
    const row = {
      id: "1",
      createdAt: new Date(),
      level: "info" as const,
      event: "e",
      message: null,
      requestId: null,
      transactionId: null,
      userId: "user-1",
      metadata: null,
    }
    vi.mocked(listByUser).mockResolvedValueOnce(
      Array.from({ length: LOG_PAGE_SIZE + 1 }, (_, i) => ({ ...row, id: String(i) })),
    )
    const full = await listApplicationLogs("user-1", {})
    expect(full.items).toHaveLength(LOG_PAGE_SIZE)
    expect(full.hasMore).toBe(true)

    vi.mocked(listByUser).mockResolvedValueOnce([row])
    const last = await listApplicationLogs("user-1", {})
    expect(last.items).toHaveLength(1)
    expect(last.hasMore).toBe(false)
  })

  it("query schema rejects injection-shaped garbage safely", () => {
    const result = applicationLogQuerySchema.safeParse({
      event: "'; DROP TABLE application_log; --",
      requestId: "x".repeat(1000),
    })
    // Overlong requestId is rejected by the schema; the event string itself
    // is harmless because Drizzle parameterizes all values.
    expect(result.success).toBe(false)
  })

  it("passes path and statusCode filters through to the repository", async () => {
    await listApplicationLogs("user-1", {
      path: "/api/transactions",
      statusCode: "422",
    })
    const [, filter] = vi.mocked(listByUser).mock.calls[0]!
    expect(filter.path).toBe("/api/transactions")
    expect(filter.statusCode).toBe(422)
  })

  it("ignores an out-of-range statusCode filter instead of failing", async () => {
    await listApplicationLogs("user-1", { statusCode: "9999" })
    const [, filter] = vi.mocked(listByUser).mock.calls[0]!
    expect(filter.statusCode).toBeUndefined()
  })

  it("a user only ever queries their own logs (mandatory userId scope)", async () => {
    // The repository is always called with the caller's userId; there is no
    // parameter path by which another user's id can be supplied.
    await listApplicationLogs("user-A", { requestId: "shared-req" })
    await listApplicationLogs("user-B", { requestId: "shared-req" })
    const calls = vi.mocked(listByUser).mock.calls
    expect(calls[calls.length - 2]![0]).toBe("user-A")
    expect(calls[calls.length - 1]![0]).toBe("user-B")
    // userId is never part of the client-controllable filter object.
    await listApplicationLogs("user-A", { userId: "user-B" })
    const [, filter] = vi.mocked(listByUser).mock.calls.at(-1)!
    expect(filter).not.toHaveProperty("userId")
  })
})
