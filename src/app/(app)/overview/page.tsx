import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react"
import { requireUser } from "@/infrastructure/auth/session"
import {
  getPeriodSummary,
  listTransactionsWithDeliveries,
} from "@/domain/transaction/service"
import {
  monthKeyOf,
  monthPeriod,
  shiftMonthKey,
  type CurrencySummary,
} from "@/domain/transaction/summary"
import { materializeDueRules } from "@/domain/recurring/service"
import { listConnections } from "@/domain/connection/service"
import * as apiKeyService from "@/domain/api-key/service"
import { EmptyState } from "@/components/ui/empty-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Amount } from "@/components/ui/amount"
import { Button } from "@/components/ui/button"
import { formatTransactionDate, formatMinorUnits } from "@/lib/money"
import { AddTransactionDialog } from "../_components/add-transaction-dialog"

export const metadata: Metadata = { title: "Overview" }

interface OverviewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function SummaryCard({
  label,
  minor,
  currency,
  hint,
  signed = false,
}: {
  label: string
  minor: number
  currency: string
  hint: string
  signed?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">
          <Amount minor={minor} currency={currency} signed={signed} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

/** Proportional bar list of the period's top expense categories. */
function TopCategories({ summary }: { summary: CurrencySummary }) {
  const top = summary.topCategories.slice(0, 6)
  if (top.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No categorized expenses in this period yet.
      </p>
    )
  }
  const max = top[0]?.expenseMinor ?? 1
  return (
    <div className="flex flex-col gap-3">
      {top.map(({ category, expenseMinor }) => (
        <div key={category} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-sm">
            <span>{category}</span>
            <Amount minor={expenseMinor} currency={summary.currency} className="text-muted-foreground" />
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${Math.max(2, Math.round((expenseMinor / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Daily income/expense evolution for the period as a lightweight CSS bar
 * chart — one column per day with activity, expense downward-neutral and
 * income in the success color.
 */
function DailyEvolution({ summary }: { summary: CurrencySummary }) {
  const days = summary.daily
  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity in this period yet.
      </p>
    )
  }
  const max = Math.max(
    ...days.map((d) => Math.max(d.incomeMinor, d.expenseMinor)),
    1,
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-32 items-end gap-1">
        {days.map((day) => (
          <div
            key={day.date}
            className="flex h-full min-w-1 flex-1 items-end justify-center gap-0.5"
            title={`${day.date} — income ${formatMinorUnits(day.incomeMinor, summary.currency)}, expenses ${formatMinorUnits(day.expenseMinor, summary.currency)}`}
          >
            <div
              className="w-1/2 rounded-sm bg-success"
              style={{ height: `${Math.max(day.incomeMinor > 0 ? 2 : 0, Math.round((day.incomeMinor / max) * 100))}%` }}
            />
            <div
              className="w-1/2 rounded-sm bg-primary"
              style={{ height: `${Math.max(day.expenseMinor > 0 ? 2 : 0, Math.round((day.expenseMinor / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-success" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-primary" /> Expenses
        </span>
      </div>
    </div>
  )
}

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const { user } = await requireUser()
  // Materialize any due recurring income/expenses before summarizing so the
  // period totals always include them (idempotent — never double-counted).
  await materializeDueRules(user.id)

  const params = await searchParams
  const rawMonth = typeof params.month === "string" ? params.month : undefined
  const monthKey = rawMonth && monthPeriod(rawMonth) ? rawMonth : monthKeyOf(new Date())
  const period = monthPeriod(monthKey)!

  const [summary, recent, connections, keys] = await Promise.all([
    getPeriodSummary(user.id, period.from, period.to),
    listTransactionsWithDeliveries(user.id, 5),
    listConnections(user.id),
    apiKeyService.listActiveKeys(user.id),
  ])

  const primary = summary.currencies[0]
  const extraCurrencies = summary.currencies.slice(1)
  const hasNothing =
    !primary && connections.length === 0 && keys.length === 0
  const monthLabel = period.from.toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  if (hasNothing) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your financial overview will appear here as soon as there is data.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Three steps to start tracking your money automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<Receipt />}
              title="Set up your flow"
              description="Add your recurring income and expenses, create an API key, connect Notion, then point your Apple Wallet shortcut at Spendly."
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            How much came in, how much went out, and what is left.
          </p>
        </div>
        <div className="flex gap-2">
          <AddTransactionDialog fixedType="expense" triggerLabel="Add expense" />
          <AddTransactionDialog fixedType="income" triggerLabel="Add income" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="icon" aria-label="Previous month">
          <Link href={`/overview?month=${shiftMonthKey(monthKey, -1)}`}>
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <h2 className="min-w-36 text-center text-lg font-medium">{monthLabel}</h2>
        <Button asChild variant="outline" size="icon" aria-label="Next month">
          <Link href={`/overview?month=${shiftMonthKey(monthKey, 1)}`}>
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>

      {primary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="Income"
              minor={primary.incomeMinor}
              currency={primary.currency}
              hint="Money in this period"
            />
            <SummaryCard
              label="Expenses"
              minor={primary.expenseMinor}
              currency={primary.currency}
              hint="Money out this period"
            />
            <SummaryCard
              label="Remaining"
              minor={primary.remainingMinor}
              currency={primary.currency}
              signed
              hint="Income minus expenses"
            />
          </div>
          {extraCurrencies.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Also active this period:{" "}
              {extraCurrencies
                .map(
                  (c) =>
                    `${c.currency} (income ${formatMinorUnits(c.incomeMinor, c.currency)}, expenses ${formatMinorUnits(c.expenseMinor, c.currency)})`,
                )
                .join(" · ")}
              . Totals are never summed across currencies.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Period evolution</CardTitle>
                <CardDescription>Daily income and expenses.</CardDescription>
              </CardHeader>
              <CardContent>
                <DailyEvolution summary={primary} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top spending categories</CardTitle>
              </CardHeader>
              <CardContent>
                <TopCategories summary={primary} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{monthLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<Receipt />}
              title="No movements in this period"
              description="Add an expense or income, or set up recurring rules, and the totals will appear here."
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {recent.length === 0 ? (
            <div className="px-6 py-4">
              <EmptyState
                icon={<Receipt />}
                title="No transactions yet"
                description="Transactions appear here as soon as they arrive."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-6 py-2 font-medium">Merchant</th>
                    <th className="px-6 py-2 font-medium text-right">Amount</th>
                    <th className="px-6 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(({ transaction }) => (
                    <tr key={transaction.id} className="border-b last:border-0">
                      <td className="px-6 py-3 font-medium">{transaction.merchant}</td>
                      <td className="px-6 py-3 text-right">
                        <Amount
                          minor={
                            transaction.type === "expense"
                              ? -Math.abs(transaction.amountMinor)
                              : Math.abs(transaction.amountMinor)
                          }
                          currency={transaction.currency}
                          signed
                          className="font-medium"
                        />
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {formatTransactionDate(transaction.date.toISOString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
