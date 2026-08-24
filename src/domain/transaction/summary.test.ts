import { describe, it, expect } from "vitest"
import type { Transaction } from "@/infrastructure/db/schema"
import {
  summarizeTransactions,
  monthPeriod,
  monthKeyOf,
  shiftMonthKey,
} from "./summary"

/*
  Summary aggregation tests. The core guarantee: totals are exact integer
  minor-unit sums (Income − Expenses = Remaining, to the cent) and each
  transaction is counted exactly once.
*/

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: crypto.randomUUID(),
    userId: "user-1",
    merchant: "Merchant",
    amountMinor: 0,
    currency: "EUR",
    date: new Date("2026-08-10T12:00:00.000Z"),
    type: "expense",
    category: null,
    subcategory: null,
    source: "manual",
    account: null,
    paymentMethod: null,
    externalId: crypto.randomUUID(),
    recurringRuleId: null,
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    updatedAt: new Date("2026-08-10T12:00:00.000Z"),
    ...overrides,
  }
}

describe("summarizeTransactions", () => {
  it("sums income and expenses exactly in minor units", () => {
    // 1.40 + 2.35 + 10.99 must equal exactly 14.74 (1474 cents).
    const summary = summarizeTransactions([
      tx({ type: "expense", amountMinor: 140 }),
      tx({ type: "expense", amountMinor: 235 }),
      tx({ type: "expense", amountMinor: 1099 }),
      tx({ type: "income", amountMinor: 240000 }),
    ])
    const eur = summary.currencies[0]!
    expect(eur.expenseMinor).toBe(1474)
    expect(eur.incomeMinor).toBe(240000)
    expect(eur.remainingMinor).toBe(240000 - 1474)
  })

  it("treats refunds as negative expenses", () => {
    const summary = summarizeTransactions([
      tx({ type: "expense", amountMinor: 1000 }),
      tx({ type: "refund", amountMinor: 250 }),
    ])
    expect(summary.currencies[0]!.expenseMinor).toBe(750)
  })

  it("excludes transfers from income and expense totals", () => {
    const summary = summarizeTransactions([
      tx({ type: "transfer", amountMinor: 5000 }),
      tx({ type: "income", amountMinor: 100 }),
    ])
    const eur = summary.currencies[0]!
    expect(eur.incomeMinor).toBe(100)
    expect(eur.expenseMinor).toBe(0)
    expect(eur.transactionCount).toBe(2)
  })

  it("never sums across currencies", () => {
    const summary = summarizeTransactions([
      tx({ type: "income", amountMinor: 1000, currency: "EUR" }),
      tx({ type: "income", amountMinor: 500, currency: "USD" }),
    ])
    expect(summary.currencies).toHaveLength(2)
    const eur = summary.currencies.find((c) => c.currency === "EUR")!
    const usd = summary.currencies.find((c) => c.currency === "USD")!
    expect(eur.incomeMinor).toBe(1000)
    expect(usd.incomeMinor).toBe(500)
  })

  it("aggregates expenses per category, uncategorized last-resort label", () => {
    const summary = summarizeTransactions([
      tx({ type: "expense", amountMinor: 300, category: "Groceries" }),
      tx({ type: "expense", amountMinor: 200, category: "Groceries" }),
      tx({ type: "expense", amountMinor: 100, category: null }),
      tx({ type: "income", amountMinor: 9999, category: "Salary" }),
    ])
    const cats = summary.currencies[0]!.topCategories
    expect(cats).toEqual([
      { category: "Groceries", expenseMinor: 500 },
      { category: "Uncategorized", expenseMinor: 100 },
    ])
  })

  it("builds a per-day series, oldest first", () => {
    const summary = summarizeTransactions([
      tx({ type: "expense", amountMinor: 100, date: new Date("2026-08-12T09:00:00.000Z") }),
      tx({ type: "income", amountMinor: 500, date: new Date("2026-08-10T09:00:00.000Z") }),
      tx({ type: "expense", amountMinor: 50, date: new Date("2026-08-10T20:00:00.000Z") }),
    ])
    expect(summary.currencies[0]!.daily).toEqual([
      { date: "2026-08-10", incomeMinor: 500, expenseMinor: 50 },
      { date: "2026-08-12", incomeMinor: 0, expenseMinor: 100 },
    ])
  })

  it("counts a recurring-generated transaction exactly once, like any other", () => {
    // A €300 rent rule generates one €300 transaction. The overview reads
    // only transactions, so the total must be 300 — never 600.
    const generated = tx({
      type: "expense",
      amountMinor: 30000,
      source: "recurring",
      recurringRuleId: "rule-1",
      externalId: "recurring:rule-1:2026-08-01",
    })
    const summary = summarizeTransactions([generated])
    expect(summary.currencies[0]!.expenseMinor).toBe(30000)
  })

  it("returns an empty summary for no transactions", () => {
    expect(summarizeTransactions([]).currencies).toEqual([])
  })
})

describe("monthPeriod", () => {
  it("covers the full UTC month, inclusive", () => {
    const period = monthPeriod("2026-08")!
    expect(period.from.toISOString()).toBe("2026-08-01T00:00:00.000Z")
    expect(period.to.toISOString()).toBe("2026-08-31T23:59:59.999Z")
  })

  it("handles February in leap years", () => {
    expect(monthPeriod("2024-02")!.to.toISOString()).toBe(
      "2024-02-29T23:59:59.999Z",
    )
  })

  it("rejects malformed keys", () => {
    expect(monthPeriod("2026-13")).toBeNull()
    expect(monthPeriod("august")).toBeNull()
  })
})

describe("monthKeyOf / shiftMonthKey", () => {
  it("round-trips and shifts across year boundaries", () => {
    expect(monthKeyOf(new Date("2026-08-24T10:00:00.000Z"))).toBe("2026-08")
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12")
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01")
  })
})
