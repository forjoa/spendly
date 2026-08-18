import { describe, it, expect } from "vitest"
import { summarizeBody } from "./body-inspect"

/*
  Body inspector tests.

  The summary is the key artifact for diagnosing a real Apple Wallet 422: it
  records which fields arrived and their type/length WITHOUT values. These
  tests pin the shape so the summary stays useful and value-free.
*/

describe("summarizeBody", () => {
  it("returns unknown for non-object bodies", () => {
    expect(summarizeBody("hello")).toEqual({ bodyType: "unknown", itemCount: 0 })
    expect(summarizeBody(null)).toEqual({ bodyType: "unknown", itemCount: 0 })
    expect(summarizeBody(42)).toEqual({ bodyType: "unknown", itemCount: 0 })
  })

  it("describes a single object with all schema fields present", () => {
    const summary = summarizeBody({
      merchant: "Coffee Shop",
      amountMinor: 599,
      currency: "EUR",
      date: "2026-08-12T10:30:00.000Z",
      type: "expense",
      source: "apple_wallet",
      externalId: "wallet-2026-08-12-10-30",
    })
    expect(summary.bodyType).toBe("object")
    expect(summary.itemCount).toBe(1)
    expect(summary.extraFields).toEqual([])
    const f = summary.fields!
    expect(f.merchant).toEqual({ present: true, type: "string", length: 11 })
    expect(f.amountMinor).toEqual({ present: true, type: "number", length: 3 })
    expect(f.currency).toEqual({ present: true, type: "string", length: 3 })
    expect(f.date).toEqual({ present: true, type: "string", length: 24 })
    expect(f.type).toEqual({ present: true, type: "string", length: 7 })
    expect(f.source).toEqual({ present: true, type: "string", length: 12 })
    expect(f.externalId).toEqual({ present: true, type: "string", length: 23 })
    expect(f.category).toEqual({ present: false })
  })

  it("records absent fields and present nulls distinctly", () => {
    const summary = summarizeBody({
      merchant: "X",
      amountMinor: 100,
      currency: "usd",
      date: "2026-08-12T10:30:00.000Z",
      source: "s",
      externalId: "id",
      category: null,
    })
    const f = summary.fields!
    // type defaults in Zod; absent here means it was not sent.
    expect(f.type).toEqual({ present: false })
    expect(f.category).toEqual({ present: true, type: "null" })
  })

  it("reports extra fields by name without values", () => {
    const summary = summarizeBody({
      merchant: "X",
      amountMinor: 100,
      currency: "EUR",
      date: "2026-08-12T10:30:00.000Z",
      source: "s",
      externalId: "id",
      unknownExtra: "something",
      anotherOne: 99,
    })
    expect(summary.extraFields).toEqual(
      expect.arrayContaining(["unknownExtra", "anotherOne"]),
    )
    // Extra values are NOT included anywhere in the summary.
    expect(JSON.stringify(summary)).not.toContain("something")
  })

  it("summarizes an array by its first item and reports full count", () => {
    const summary = summarizeBody([
      {
        merchant: "A",
        amountMinor: 1,
        currency: "EUR",
        date: "2026-08-12T10:30:00.000Z",
        source: "s",
        externalId: "id1",
      },
      {
        merchant: "B",
        amountMinor: 2,
        currency: "EUR",
        date: "2026-08-12T10:31:00.000Z",
        source: "s",
        externalId: "id2",
      },
    ])
    expect(summary.bodyType).toBe("array")
    expect(summary.itemCount).toBe(2)
    expect(summary.fields!.merchant).toEqual({ present: true, type: "string", length: 1 })
  })

  it("never includes any field value in the summary", () => {
    const sensitive = "sk_live_should_not_appear"
    const summary = summarizeBody({
      merchant: sensitive,
      amountMinor: 599,
      currency: "EUR",
      date: "2026-08-12T10:30:00.000Z",
      source: "s",
      externalId: "id",
    })
    expect(JSON.stringify(summary)).not.toContain(sensitive)
  })
})
