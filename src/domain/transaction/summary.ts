import type { Transaction } from "@/infrastructure/db/schema"

/*
  Financial summary aggregation.

  Pure functions over transaction rows — no database, no clock. All sums are
  computed over integer minor units, so Income − Expenses is exact to the
  cent; floats never enter the calculation.

  Counting rules:
  - income  → income total
  - expense → expense total
  - refund  → reduces the expense total (money coming back against spending)
  - transfer → excluded from both totals (money moving between own accounts)
*/

export interface CurrencySummary {
  currency: string
  incomeMinor: number
  expenseMinor: number
  /** incomeMinor − expenseMinor */
  remainingMinor: number
  /** Expense totals per category, highest first. */
  topCategories: { category: string; expenseMinor: number }[]
  /** Per-day income/expense, oldest first, for period evolution charts. */
  daily: { date: string; incomeMinor: number; expenseMinor: number }[]
  transactionCount: number
}

export interface PeriodSummary {
  /** One summary per currency present in the period, highest activity first. */
  currencies: CurrencySummary[]
}

export function summarizeTransactions(transactions: Transaction[]): PeriodSummary {
  const byCurrency = new Map<
    string,
    {
      incomeMinor: number
      expenseMinor: number
      categories: Map<string, number>
      days: Map<string, { incomeMinor: number; expenseMinor: number }>
      count: number
    }
  >()

  for (const tx of transactions) {
    let bucket = byCurrency.get(tx.currency)
    if (!bucket) {
      bucket = {
        incomeMinor: 0,
        expenseMinor: 0,
        categories: new Map(),
        days: new Map(),
        count: 0,
      }
      byCurrency.set(tx.currency, bucket)
    }
    bucket.count += 1

    const dayKey = tx.date.toISOString().slice(0, 10)
    let day = bucket.days.get(dayKey)
    if (!day) {
      day = { incomeMinor: 0, expenseMinor: 0 }
      bucket.days.set(dayKey, day)
    }

    // Amounts are stored as positive minor units; the type carries direction.
    const amount = Math.abs(tx.amountMinor)
    if (tx.type === "income") {
      bucket.incomeMinor += amount
      day.incomeMinor += amount
    } else if (tx.type === "expense") {
      bucket.expenseMinor += amount
      day.expenseMinor += amount
      const category = tx.category?.trim() || "Uncategorized"
      bucket.categories.set(
        category,
        (bucket.categories.get(category) ?? 0) + amount,
      )
    } else if (tx.type === "refund") {
      bucket.expenseMinor -= amount
      day.expenseMinor -= amount
    }
    // transfer: excluded from income/expense totals by design.
  }

  const currencies: CurrencySummary[] = []
  for (const [currency, bucket] of byCurrency) {
    currencies.push({
      currency,
      incomeMinor: bucket.incomeMinor,
      expenseMinor: bucket.expenseMinor,
      remainingMinor: bucket.incomeMinor - bucket.expenseMinor,
      topCategories: [...bucket.categories.entries()]
        .map(([category, expenseMinor]) => ({ category, expenseMinor }))
        .sort((a, b) => b.expenseMinor - a.expenseMinor),
      daily: [...bucket.days.entries()]
        .map(([date, totals]) => ({ date, ...totals }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      transactionCount: bucket.count,
    })
  }
  currencies.sort(
    (a, b) =>
      b.incomeMinor + b.expenseMinor - (a.incomeMinor + a.expenseMinor),
  )
  return { currencies }
}

/**
 * The [from, to] bounds (inclusive, UTC) of a calendar month given as
 * "YYYY-MM". Returns null when the key is malformed.
 */
export function monthPeriod(monthKey: string): { from: Date; to: Date } | null {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (monthIndex < 0 || monthIndex > 11) return null
  const from = new Date(Date.UTC(year, monthIndex, 1))
  const to = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999))
  return { from, to }
}

/** The "YYYY-MM" key of the UTC month containing `date`. */
export function monthKeyOf(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

/** Shift a "YYYY-MM" key by `delta` months. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const period = monthPeriod(monthKey)
  if (!period) return monthKey
  const year = period.from.getUTCFullYear()
  const monthIndex = period.from.getUTCMonth() + delta
  return monthKeyOf(new Date(Date.UTC(year, monthIndex, 1)))
}
