import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

/*
  PostgreSQL log sink tests.

  The domain service (the DB boundary) is mocked at the module level so NO
  real database is touched. These tests verify:

  - No-op when DATABASE_URL is not configured.
  - Per-request buffering: concurrent requests never share a batch.
  - Column extraction: requestId/userId/transactionId/message are lifted to
    columns; everything else lands in metadata.
  - userId backfill: pre-auth events of an authenticated request are
    persisted with the userId attached to the log context after auth.
  - Requests that fail authentication persist userId = null (never visible
    in another user's /logs view).
  - Fail-safe: a database error never throws into the request path and is
    never re-logged through the logger (no recursion).
*/

vi.mock("@/domain/log/service", () => ({
  recordApplicationLogs: vi.fn(async () => undefined),
}))

const { recordApplicationLogs } = await import("@/domain/log/service")
const {
  ensureDbSink,
  flushDbLogs,
  _resetDbSinkForTests,
} = await import("@/infrastructure/observability/db-sink")
const { log, clearSinks, runWithLogContext, attachLogContext } = await import(
  "@/lib/logger"
)

const TX_ID = "3f6b9c12-6c6f-4c8c-9c1f-2b6b9c6f3f6b"

type RecordArg = Record<string, unknown>

function flushedBatches(): RecordArg[][] {
  return vi.mocked(recordApplicationLogs).mock.calls.map(
    ([records]) => records as RecordArg[],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetDbSinkForTests()
  clearSinks()
  process.env.DATABASE_URL = "postgresql://user:pass@host/db"
})

afterEach(() => {
  _resetDbSinkForTests()
  clearSinks()
  delete process.env.DATABASE_URL
})

describe("db sink registration", () => {
  it("persists nothing when DATABASE_URL is not configured", async () => {
    delete process.env.DATABASE_URL
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, async () => {
      log.info("e", { x: 1 })
      await flushDbLogs()
    })
    expect(recordApplicationLogs).not.toHaveBeenCalled()
  })

  it("does not call the database when there are no events", async () => {
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, () => flushDbLogs())
    expect(recordApplicationLogs).not.toHaveBeenCalled()
  })
})

describe("db sink mapping", () => {
  it("lifts columns and keeps the rest in metadata", async () => {
    ensureDbSink()
    await runWithLogContext({ requestId: "r1", userId: "user-1" }, async () => {
      log.error("transaction.ingest.failed", {
        transactionId: TX_ID,
        message: "boom",
        errorType: "Error",
        merchant: "Coffee Shop",
      })
      await flushDbLogs()
    })

    expect(recordApplicationLogs).toHaveBeenCalledTimes(1)
    const record = flushedBatches()[0]![0]!
    expect(record.userId).toBe("user-1")
    expect(record.requestId).toBe("r1")
    expect(record.transactionId).toBe(TX_ID)
    expect(record.level).toBe("error")
    expect(record.event).toBe("transaction.ingest.failed")
    expect(record.message).toBe("boom")
    expect(record.metadata).toEqual({
      errorType: "Error",
      merchant: "Coffee Shop",
    })
    expect(typeof record.timestamp).toBe("string")
  })

  it("keeps a non-uuid transactionId in metadata and nulls the column", async () => {
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, async () => {
      log.info("e", { transactionId: "tx-1" })
      await flushDbLogs()
    })
    const record = flushedBatches()[0]![0]!
    expect(record.transactionId).toBeUndefined()
    expect(record.metadata).toEqual({ transactionId: "tx-1" })
  })

  it("omits metadata when the event carries no extra fields", async () => {
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, async () => {
      log.info("transaction.request.completed", {})
      await flushDbLogs()
    })
    const record = flushedBatches()[0]![0]!
    expect(record.metadata).toBeUndefined()
  })

  it("persists events already redacted by the logger", async () => {
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, async () => {
      log.info("e", {
        authorization: "Bearer sk_live_shouldneverpersist",
        note: "token is sk_live_shouldneverpersist here",
      })
      await flushDbLogs()
    })
    const record = flushedBatches()[0]![0]!
    const dump = JSON.stringify(record)
    expect(dump).not.toContain("sk_live_shouldneverpersist")
    expect((record.metadata as Record<string, unknown>).authorization).toBe(
      "[REDACTED]",
    )
  })
})

describe("db sink userId backfill", () => {
  it("backfills pre-auth events with the userId attached after auth", async () => {
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, async () => {
      // Pre-auth events have no userId yet.
      log.info("transaction.request.received", { method: "POST" })
      log.info("transaction.body.parsed", { bodyType: "object" })
      attachLogContext({ userId: "user-1" })
      // Post-auth events carry userId directly.
      log.info("transaction.ingest.started", { userId: "user-1" })
      await flushDbLogs()
    })

    const records = flushedBatches()[0]!
    expect(records).toHaveLength(3)
    for (const record of records) {
      expect(record.userId).toBe("user-1")
    }
  })

  it("keeps userId null for requests that never authenticate", async () => {
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, async () => {
      log.warn("transaction.auth.failure", { reason: "not-found" })
      await flushDbLogs()
    })
    const record = flushedBatches()[0]![0]!
    expect(record.userId).toBeUndefined()
    expect(record.event).toBe("transaction.auth.failure")
  })
})

describe("db sink per-request isolation", () => {
  it("flushing request A never persists request B's buffered events", async () => {
    ensureDbSink()
    await runWithLogContext({ requestId: "req-A" }, async () => {
      log.info("a.first", {})
      // Interleave request B before A flushes.
      await runWithLogContext({ requestId: "req-B" }, async () => {
        log.info("b.first", {})
        // B has not flushed yet; A flushes now.
        await runWithLogContext({ requestId: "req-A" }, () => flushDbLogs())
        expect(flushedBatches().flat().map((r) => r.event)).toEqual(["a.first"])
        // B flushes; only B's events are persisted in this batch.
        await flushDbLogs()
      })
    })
    const all = flushedBatches().flat().map((r) => r.event)
    expect(all).toEqual(["a.first", "b.first"])
  })

  it("drains the global bucket (no request context) on the next flush", async () => {
    ensureDbSink()
    log.info("system.event", { outside: true })
    await runWithLogContext({ requestId: "r1" }, async () => {
      log.info("r1.event", {})
      await flushDbLogs()
    })
    const events = flushedBatches()[0]!.map((r) => r.event)
    expect(events).toContain("system.event")
    expect(events).toContain("r1.event")
  })
})

describe("db sink fail-safe", () => {
  it("a database error never throws and never recurses into the logger", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(recordApplicationLogs).mockRejectedValueOnce(
      new Error("connection refused"),
    )
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, async () => {
      log.info("e", { x: 1 })
      await expect(flushDbLogs()).resolves.toBeUndefined()
    })
    // The failure is surfaced to the console exactly once, as a JSON line.
    const sinkFailures = consoleSpy.mock.calls.filter(([arg]) =>
      String(arg).includes("db_log_sink.flush.failed"),
    )
    expect(sinkFailures).toHaveLength(1)
    expect(sinkFailures[0]![0]).not.toContain("sk_live")
    consoleSpy.mockRestore()
  })

  it("keeps logging working after a failed flush", async () => {
    vi.mocked(recordApplicationLogs).mockRejectedValueOnce(new Error("down"))
    ensureDbSink()
    await runWithLogContext({ requestId: "r1" }, async () => {
      log.info("first", {})
      await flushDbLogs()
      log.info("second", {})
      await flushDbLogs()
    })
    const events = flushedBatches().flat().map((r) => r.event)
    expect(events).toContain("second")
  })
})
