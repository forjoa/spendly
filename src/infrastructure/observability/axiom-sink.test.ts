import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

/*
  Axiom sink tests.

  The sink uses global `fetch` to POST NDJSON to Axiom's ingest endpoint. We
  mock `fetch` so NO real network/Axiom calls happen during tests. The token
  is read from process.env at ingest time and is never placed into a log
  event or into the (captured) fetch body beyond the Authorization header.
*/

const {
  ensureAxiomSink,
  flushAxiom,
  _resetAxiomSinkForTests,
  _readAxiomConfigForTests,
} = await import("@/infrastructure/observability/axiom-sink")
const { log, clearSinks, captureEvents, runWithLogContext } = await import(
  "@/lib/logger"
)

const DATASET = "spendly-test"
const TOKEN = "xapt-test-token-not-real"
const URL = "https://api.axiom.co"

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  _resetAxiomSinkForTests()
  clearSinks()
  process.env.AXIOM_DATASET = DATASET
  process.env.AXIOM_TOKEN = TOKEN
  process.env.AXIOM_URL = URL
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response)
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  _resetAxiomSinkForTests()
  clearSinks()
  delete process.env.AXIOM_DATASET
  delete process.env.AXIOM_TOKEN
  delete process.env.AXIOM_URL
  vi.unstubAllGlobals()
})

describe("Axiom sink config", () => {
  it("reads dataset, token, and url from env", () => {
    const config = _readAxiomConfigForTests()
    expect(config).toEqual({ url: URL, dataset: DATASET, token: TOKEN })
  })

  it("defaults AXIOM_URL to https://api.axiom.co", () => {
    delete process.env.AXIOM_URL
    const config = _readAxiomConfigForTests()
    expect(config!.url).toBe("https://api.axiom.co")
  })

  it("returns undefined when dataset or token is missing", () => {
    delete process.env.AXIOM_TOKEN
    expect(_readAxiomConfigForTests()).toBeUndefined()
    process.env.AXIOM_TOKEN = TOKEN
    delete process.env.AXIOM_DATASET
    expect(_readAxiomConfigForTests()).toBeUndefined()
  })
})

describe("Axiom sink flush", () => {
  it("POSTs buffered events as NDJSON with Bearer token header", async () => {
    ensureAxiomSink()
    const requestId = "req-1"
    await runWithLogContext({ requestId }, async () => {
      log.info("transaction.request.received", { method: "POST" })
      log.info("transaction.request.completed", { statusCode: 201 })
      await flushAxiom()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${URL}/v1/datasets/${DATASET}/_ingest`)
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    )
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-ndjson",
    )

    // Body is NDJSON with one object per line, each carrying the requestId.
    const lines = (init.body as string).split("\n").filter(Boolean)
    expect(lines.length).toBe(2)
    const first = JSON.parse(lines[0]!)
    expect(first.event).toBe("transaction.request.received")
    expect(first.requestId).toBe(requestId)
  })

  it("does not call fetch when there are no events", async () => {
    ensureAxiomSink()
    await flushAxiom()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not call fetch when Axiom is unconfigured", async () => {
    delete process.env.AXIOM_TOKEN
    _resetAxiomSinkForTests()
    ensureAxiomSink()
    log.info("e", { x: 1 })
    await flushAxiom()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("never includes the token in the request body", async () => {
    ensureAxiomSink()
    log.info("e", { note: "anything" })
    await flushAxiom()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body as string).not.toContain(TOKEN)
  })

  it("survives a non-OK response without throwing", async () => {
    fetchMock = vi.fn(async () => ({ ok: false, status: 401, statusText: "Unauthorized" }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    ensureAxiomSink()
    log.info("e", { x: 1 })
    await expect(flushAxiom()).resolves.toBeUndefined()
  })

  it("survives a network error without throwing", async () => {
    fetchMock = vi.fn(async () => {
      throw new Error("ETIMEDOUT")
    })
    vi.stubGlobal("fetch", fetchMock)
    ensureAxiomSink()
    log.info("e", { x: 1 })
    await expect(flushAxiom()).resolves.toBeUndefined()
  })

  it("flushes in batches without duplicating events across flushes", async () => {
    ensureAxiomSink()
    // Generate 250 events (> 100 batch size) to exercise batching.
    for (let i = 0; i < 250; i++) {
      log.info("e", { i })
    }
    await flushAxiom()
    // A second flush after the buffer is drained sends nothing.
    await flushAxiom()
    const totalEvents = fetchMock.mock.calls.reduce((sum: number, [, init]) => {
      const lines = ((init as RequestInit).body as string).split("\n").filter(Boolean)
      return sum + lines.length
    }, 0)
    expect(totalEvents).toBe(250)
  })
})

describe("Axiom sink + capture sink coexist", () => {
  it("in-process capture still receives events when Axiom is configured", async () => {
    ensureAxiomSink()
    const capture = captureEvents()
    log.info("e", { x: 1 })
    await flushAxiom()
    expect(capture.events.length).toBe(1)
    capture.stop()
  })
})
