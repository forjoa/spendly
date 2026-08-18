import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import type { Transaction } from "@/infrastructure/db/schema"

/*
  Notion adapter tests.

  The adapter uses the global `fetch` to call the Notion REST API. We mock
  `fetch` to return controlled responses so we can exercise:

  - successful delivery (schema fetch + page creation both succeed)
  - missing required property in the database
  - property type mismatch (adapter maps to the real type)
  - Notion HTTP 400 on page creation (original error logged, sanitized to client)
  - Category omitted when the database has no Category property
  - successful idempotent retry (second call returns a new page id)

  The Notion token is never logged. We verify that console.error is called
  with the Notion error code/message but never the token.
*/

// Stub `server-only` is handled by the vitest alias.

const { deliverToNotion } = await import("./adapter")

// ── helpers ───────────────────────────────────────────────────────────

const TOKEN = "ntn_test_secret_token_xyz"
const DATABASE_ID = "abc123def4567890abc123def4567890"
const PAGE_ID = "page-uuid-1234"

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-id-1",
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
    createdAt: new Date("2026-08-12T10:30:00.000Z"),
    updatedAt: new Date("2026-08-12T10:30:00.000Z"),
    ...overrides,
  }
}

/** A Notion database properties map matching the documented schema. */
function documentedSchema(): Record<string, { type: string }> {
  return {
    Merchant: { type: "title" },
    Amount: { type: "rich_text" },
    Currency: { type: "select" },
    Date: { type: "date" },
    Type: { type: "select" },
    Source: { type: "rich_text" },
    "External ID": { type: "rich_text" },
  }
}

/** Build a mock fetch that returns the database schema then the page creation. */
function mockFetch(opts: {
  schemaStatus?: number
  schemaBody?: unknown
  pageStatus?: number
  pageBody?: unknown
  schemaErrorBody?: unknown
  pageErrorBody?: unknown
}): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString()

    // GET /v1/databases/{id}
    if (urlStr.includes(`/databases/`)) {
      const status = opts.schemaStatus ?? 200
      if (status !== 200) {
        return makeResponse(status, opts.schemaErrorBody ?? {})
      }
      return makeResponse(200, opts.schemaBody ?? { properties: documentedSchema() })
    }

    // POST /v1/pages
    if (urlStr.endsWith("/pages")) {
      const status = opts.pageStatus ?? 200
      if (status !== 200) {
        return makeResponse(status, opts.pageErrorBody ?? {})
      }
      return makeResponse(200, opts.pageBody ?? { id: PAGE_ID })
    }

    return makeResponse(404, {})
  }) as ReturnType<typeof vi.fn>
}

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── tests ─────────────────────────────────────────────────────────────

describe("deliverToNotion", () => {
  describe("successful delivery", () => {
    it("returns the page id from Notion", async () => {
      fetchMock = mockFetch({})
      vi.stubGlobal("fetch", fetchMock)

      const result = await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })

      expect(result.externalDeliveryId).toBe(PAGE_ID)
    })

    it("fetches the database schema before creating the page", async () => {
      fetchMock = mockFetch({})
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })

      const calls = fetchMock.mock.calls.map((c: unknown[]) => [
        typeof c[0] === "string" ? c[0] : (c[0] as URL).toString(),
        (c[1] as RequestInit)?.method ?? "GET",
      ])
      // First call: GET the schema, second call: POST the page.
      expect(calls[0]![1]).toBe("GET")
      expect(calls[0]![0]).toContain(`/databases/${DATABASE_ID}`)
      expect(calls[1]![1]).toBe("POST")
      expect(calls[1]![0]).toContain("/pages")
    })

    it("sends the documented property names exactly", async () => {
      fetchMock = mockFetch({})
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })

      const pageCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && (c[0] as string).endsWith("/pages"),
      )
      const body = JSON.parse((pageCall![1] as RequestInit).body as string)
      const propNames = Object.keys(body.properties)
      expect(propNames).toEqual(
        expect.arrayContaining([
          "Merchant",
          "Amount",
          "Currency",
          "Date",
          "Type",
          "Source",
          "External ID",
        ]),
      )
    })
  })

  describe("missing required property", () => {
    it("throws a DestinationError naming the missing property", async () => {
      const schema = documentedSchema()
      delete schema["Amount"]
      fetchMock = mockFetch({ schemaBody: { properties: schema } })
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        deliverToNotion({
          token: TOKEN,
          databaseId: DATABASE_ID,
          transaction: makeTransaction(),
        }),
      ).rejects.toThrow(/Amount/)
    })

    it("logs a server-side diagnostic with present and missing properties", async () => {
      const schema = documentedSchema()
      delete schema["Currency"]
      delete schema["Date"]
      fetchMock = mockFetch({ schemaBody: { properties: schema } })
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        deliverToNotion({
          token: TOKEN,
          databaseId: DATABASE_ID,
          transaction: makeTransaction(),
        }),
      ).rejects.toThrow()

      const logged = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join(" ")
      expect(logged).toContain("Currency")
      expect(logged).toContain("Date")
    })
  })

  describe("property type mismatch", () => {
    it("adapts when Amount is a number property instead of rich_text", async () => {
      const schema = documentedSchema()
      schema["Amount"] = { type: "number" }
      fetchMock = mockFetch({ schemaBody: { properties: schema } })
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction({ amountMinor: 599, currency: "EUR" }),
      })

      const pageCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && (c[0] as string).endsWith("/pages"),
      )
      const body = JSON.parse((pageCall![1] as RequestInit).body as string)
      // Amount is sent as { number: <value> }, not { rich_text: [...] }.
      expect(body.properties.Amount).toHaveProperty("number")
      expect(body.properties.Amount).not.toHaveProperty("rich_text")
    })

    it("adapts when Currency is multi_select instead of select", async () => {
      const schema = documentedSchema()
      schema["Currency"] = { type: "multi_select" }
      fetchMock = mockFetch({ schemaBody: { properties: schema } })
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })

      const pageCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && (c[0] as string).endsWith("/pages"),
      )
      const body = JSON.parse((pageCall![1] as RequestInit).body as string)
      expect(body.properties.Currency).toHaveProperty("multi_select")
      expect(body.properties.Currency).not.toHaveProperty("select")
    })

    it("adapts when Merchant is rich_text instead of title", async () => {
      const schema = documentedSchema()
      schema["Merchant"] = { type: "rich_text" }
      fetchMock = mockFetch({ schemaBody: { properties: schema } })
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })

      const pageCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && (c[0] as string).endsWith("/pages"),
      )
      const body = JSON.parse((pageCall![1] as RequestInit).body as string)
      expect(body.properties.Merchant).toHaveProperty("rich_text")
      expect(body.properties.Merchant).not.toHaveProperty("title")
    })
  })

  describe("Notion HTTP 400 response", () => {
    it("logs the original Notion error code and message server-side", async () => {
      fetchMock = mockFetch({
        pageStatus: 400,
        pageErrorBody: {
          object: "error",
          status: 400,
          code: "validation_error",
          message:
            "body failed validation. Fix one: body.properties.Category.rich_text should be defined",
        },
      })
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        deliverToNotion({
          token: TOKEN,
          databaseId: DATABASE_ID,
          transaction: makeTransaction(),
        }),
      ).rejects.toThrow()

      const logged = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join(" ")
      expect(logged).toContain("validation_error")
      expect(logged).toContain("body failed validation")
    })

    it("never logs the Notion token", async () => {
      fetchMock = mockFetch({
        pageStatus: 400,
        pageErrorBody: { code: "validation_error", message: "bad payload" },
      })
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        deliverToNotion({
          token: TOKEN,
          databaseId: DATABASE_ID,
          transaction: makeTransaction(),
        }),
      ).rejects.toThrow()

      const allLogged = consoleErrorSpy.mock.calls
        .map((c: unknown[]) => (c as unknown[]).map(String).join(" "))
        .join(" ")
      expect(allLogged).not.toContain(TOKEN)
    })

    it("throws a sanitized DestinationError without Notion internals", async () => {
      fetchMock = mockFetch({
        pageStatus: 400,
        pageErrorBody: {
          code: "validation_error",
          message: "body failed validation: body.properties.X.rich_text",
        },
      })
      vi.stubGlobal("fetch", fetchMock)

      try {
        await deliverToNotion({
          token: TOKEN,
          databaseId: DATABASE_ID,
          transaction: makeTransaction(),
        })
        expect.fail("should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(Error)
        const message = (err as Error).message
        // The client-facing message must be the sanitized summary, not the raw
        // Notion validation_error body.
        expect(message).not.toContain("validation_error")
        expect(message).not.toContain("body failed validation")
        expect(message).not.toContain("rich_text")
      }
    })
  })

  describe("Category omission", () => {
    it("does not send Category when the database has no Category property", async () => {
      fetchMock = mockFetch({})
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction({ category: "food" }),
      })

      const pageCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && (c[0] as string).endsWith("/pages"),
      )
      const body = JSON.parse((pageCall![1] as RequestInit).body as string)
      expect(body.properties).not.toHaveProperty("Category")
    })

    it("sends Category when the database has a Category property", async () => {
      const schema = documentedSchema()
      schema["Category"] = { type: "rich_text" }
      fetchMock = mockFetch({ schemaBody: { properties: schema } })
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction({ category: "food" }),
      })

      const pageCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && (c[0] as string).endsWith("/pages"),
      )
      const body = JSON.parse((pageCall![1] as RequestInit).body as string)
      expect(body.properties).toHaveProperty("Category")
      expect(body.properties.Category).toHaveProperty("rich_text")
    })

    it("does not send Category when category is null even if property exists", async () => {
      const schema = documentedSchema()
      schema["Category"] = { type: "rich_text" }
      fetchMock = mockFetch({ schemaBody: { properties: schema } })
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction({ category: null }),
      })

      const pageCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && (c[0] as string).endsWith("/pages"),
      )
      const body = JSON.parse((pageCall![1] as RequestInit).body as string)
      expect(body.properties).not.toHaveProperty("Category")
    })
  })

  describe("idempotent retry", () => {
    it("a second delivery creates a new page and returns its id", async () => {
      // Simulate two independent calls (the service layer handles
      // idempotency via the delivery table; the adapter always creates a
      // page when called). Both should succeed and return page ids.
      fetchMock = mockFetch({ pageBody: { id: "page-1" } })
      vi.stubGlobal("fetch", fetchMock)

      const r1 = await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })
      expect(r1.externalDeliveryId).toBe("page-1")

      // Second call returns a different page id.
      fetchMock = mockFetch({ pageBody: { id: "page-2" } })
      vi.stubGlobal("fetch", fetchMock)

      const r2 = await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })
      expect(r2.externalDeliveryId).toBe("page-2")
    })
  })

  describe("schema fetch failure", () => {
    it("logs the Notion error and throws a sanitized DestinationError on 404", async () => {
      fetchMock = mockFetch({
        schemaStatus: 404,
        schemaErrorBody: {
          code: "object_not_found",
          message: "Could not find database",
        },
      })
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        deliverToNotion({
          token: TOKEN,
          databaseId: DATABASE_ID,
          transaction: makeTransaction(),
        }),
      ).rejects.toThrow()

      const logged = consoleErrorSpy.mock.calls
        .map((c: unknown[]) => (c as unknown[]).map(String).join(" "))
        .join(" ")
      expect(logged).toContain("object_not_found")
      expect(logged).toContain("Could not find database")
      expect(logged).not.toContain(TOKEN)
    })
  })

  /*
    Regression: Notion property names may carry incidental trailing whitespace
    (seen in production: "Date ", "Amount ", "External ID "). The adapter must
    match these against the documented logical names by their trimmed form and
    still deliver successfully, keying the payload with the actual (untrimmed)
    Notion property name so the database is never renamed or recreated.
  */
  describe("property names with trailing whitespace", () => {
    /** Schema exactly as observed in production: three keys have trailing spaces. */
    function productionSchema(): Record<string, { type: string }> {
      return {
        Merchant: { type: "title" },
        "Amount ": { type: "rich_text" },
        Currency: { type: "select" },
        "Date ": { type: "date" },
        Type: { type: "select" },
        Source: { type: "rich_text" },
        "External ID ": { type: "rich_text" },
      }
    }

    it("does not report trailing-whitespace properties as missing", async () => {
      fetchMock = mockFetch({
        schemaBody: { properties: productionSchema() },
      })
      vi.stubGlobal("fetch", fetchMock)

      // Previously this threw "Notion database is missing required properties:
      // Amount, Date, External ID". It must now succeed.
      const result = await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })

      expect(result.externalDeliveryId).toBe(PAGE_ID)
      // No Notion ERROR diagnostic should be emitted on a clean success. The
      // structured logger emits info-level events via console.error (stderr
      // JSON lines), so we assert the absence of a `[notion]` error prefix
      // rather than zero console.error calls.
      const notionErrors = consoleErrorSpy.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .filter((s: string) => s.includes("[notion]"))
      expect(notionErrors).toHaveLength(0)
    })

    it("sends the actual (untrimmed) Notion property names in the payload", async () => {
      fetchMock = mockFetch({
        schemaBody: { properties: productionSchema() },
      })
      vi.stubGlobal("fetch", fetchMock)

      await deliverToNotion({
        token: TOKEN,
        databaseId: DATABASE_ID,
        transaction: makeTransaction(),
      })

      const pageCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && (c[0] as string).endsWith("/pages"),
      )
      const body = JSON.parse((pageCall![1] as RequestInit).body as string)
      const propNames = Object.keys(body.properties)

      // The trailing-whitespace names are sent verbatim, not trimmed or
      // recreated as new properties.
      expect(propNames).toEqual(
        expect.arrayContaining([
          "Merchant",
          "Amount ",
          "Currency",
          "Date ",
          "Type",
          "Source",
          "External ID ",
        ]),
      )
      // And the trimmed logical names are NOT present as separate keys.
      expect(propNames).not.toContain("Amount")
      expect(propNames).not.toContain("Date")
      expect(propNames).not.toContain("External ID")

      // The trailing-whitespace Date property still receives a date payload.
      expect(body.properties["Date "]).toHaveProperty("date")
      // The trailing-whitespace Amount property still receives a rich_text payload.
      expect(body.properties["Amount "]).toHaveProperty("rich_text")
      // The trailing-whitespace External ID property still receives a rich_text payload.
      expect(body.properties["External ID "]).toHaveProperty("rich_text")
    })
  })
})
