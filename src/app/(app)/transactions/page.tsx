import type { Metadata } from "next"
import Link from "next/link"
import { Receipt, SearchX } from "lucide-react"
import { requireUser } from "@/infrastructure/auth/session"
import {
  listCategories,
  listTransactionsWithDeliveries,
} from "@/domain/transaction/service"
import { materializeDueRules } from "@/domain/recurring/service"
import type { TransactionFilter } from "@/domain/transaction/repository"
import { majorToMinorUnits } from "@/lib/money"
import { EmptyState } from "@/components/ui/empty-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Amount } from "@/components/ui/amount"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { StatusBadge, type DeliveryStatus } from "@/components/ui/status-badge"
import { formatTransactionDate } from "@/lib/money"
import { PageHeader } from "@/components/shell/page-header"
import { AddTransactionDialog } from "../_components/add-transaction-dialog"

export const metadata: Metadata = { title: "Transactions" }

const PROVIDER_LABELS: Record<string, string> = {
  notion: "Notion",
  google_sheets: "Google Sheets",
  ynab: "YNAB",
  webhook: "Webhook",
  custom_api: "Custom API",
}

const TYPE_OPTIONS = ["expense", "income", "refund", "transfer"] as const

const LIST_LIMIT = 100

interface TransactionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pick(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key]
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

function parseDateBoundary(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
}

/**
 * Amount range bounds are entered in major units ("50" or "32.40") and
 * converted assuming two-decimal minor units — exact for EUR/USD/GBP/CHF and
 * approximate for 0/3-exponent currencies, which is acceptable for a filter.
 */
function parseAmountBound(value: string | undefined): number | undefined {
  if (!value) return undefined
  try {
    return majorToMinorUnits(value, "EUR")
  } catch {
    return undefined
  }
}

function buildFilter(
  params: Record<string, string | string[] | undefined>,
): { filter: TransactionFilter; active: boolean; values: Record<string, string> } {
  const values = {
    q: pick(params, "q") ?? "",
    type: pick(params, "type") ?? "",
    category: pick(params, "category") ?? "",
    from: pick(params, "from") ?? "",
    to: pick(params, "to") ?? "",
    min: pick(params, "min") ?? "",
    max: pick(params, "max") ?? "",
  }
  const filter: TransactionFilter = {}
  if (values.q) filter.query = values.q
  if (TYPE_OPTIONS.includes(values.type as (typeof TYPE_OPTIONS)[number])) {
    filter.type = values.type as TransactionFilter["type"]
  }
  if (values.category) filter.category = values.category
  const from = parseDateBoundary(values.from, false)
  const to = parseDateBoundary(values.to, true)
  if (from) filter.from = from
  if (to) filter.to = to
  const min = parseAmountBound(values.min)
  const max = parseAmountBound(values.max)
  if (min !== undefined) filter.minAmountMinor = min
  if (max !== undefined) filter.maxAmountMinor = max

  const active = Boolean(
    values.q || values.type || values.category || values.from || values.to || values.min || values.max,
  )
  return { filter, active, values }
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const { user } = await requireUser()
  await materializeDueRules(user.id)
  const params = await searchParams
  const { filter, active: filtersActive, values } = buildFilter(params)
  const [rows, categories] = await Promise.all([
    listTransactionsWithDeliveries(user.id, LIST_LIMIT, filter),
    listCategories(user.id),
  ])

  if (rows.length === 0 && !filtersActive) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Transactions"
          description="Every movement Spendly knows about — synced, recurring or manual."
          actions={
            <AddTransactionDialog
              fixedType="expense"
              triggerLabel="Add expense"
              triggerVariant="default"
            />
          }
        />
        <EmptyState
          icon={<Receipt />}
          title="No transactions yet"
          description="Transactions appear here as soon as your Apple Wallet shortcut sends a payment, a recurring rule runs, or you add one manually."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Transactions"
        description="Every movement Spendly knows about — synced, recurring or manual. Newest first."
        actions={
          <AddTransactionDialog
            fixedType="expense"
            triggerLabel="Add expense"
            triggerVariant="default"
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="f-q" className="text-xs">Search</Label>
              <Input id="f-q" name="q" placeholder="Merchant…" defaultValue={values.q} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-type" className="text-xs">Type</Label>
              <Select id="f-type" name="type" defaultValue={values.type}>
                <option value="">All</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{(t[0] ?? "").toUpperCase() + t.slice(1)}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-category" className="text-xs">Category</Label>
              <Select id="f-category" name="category" defaultValue={values.category}>
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-from" className="text-xs">From</Label>
              <Input id="f-from" name="from" type="date" defaultValue={values.from} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-to" className="text-xs">To</Label>
              <Input id="f-to" name="to" type="date" defaultValue={values.to} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-min" className="text-xs">Min amount</Label>
              <Input id="f-min" name="min" inputMode="decimal" placeholder="0.00" defaultValue={values.min} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-max" className="text-xs">Max amount</Label>
              <Input id="f-max" name="max" inputMode="decimal" placeholder="100.00" defaultValue={values.max} />
            </div>
            <div className="col-span-2 flex items-end gap-2 md:col-span-4 lg:col-span-8">
              <Button type="submit" size="sm">Apply filters</Button>
              {filtersActive ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/transactions">Clear filters</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{filtersActive ? "Results" : "Recent"}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <div className="px-6 py-4">
              <EmptyState
                icon={<SearchX />}
                title="No transactions match these filters"
                description="Adjust the filters or clear them to see everything."
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
                    <th className="px-6 py-2 font-medium">Type</th>
                    <th className="px-6 py-2 font-medium">Source</th>
                    <th className="px-6 py-2 font-medium">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ transaction, deliveries }) => (
                    <tr key={transaction.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-6 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{transaction.merchant}</span>
                          {transaction.category ? (
                            <span className="text-xs text-muted-foreground">{transaction.category}</span>
                          ) : null}
                        </div>
                      </td>
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
                      <td className="px-6 py-3">
                        <Badge variant={transaction.type === "income" ? "success" : "muted"}>
                          {transaction.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {transaction.source}
                      </td>
                      <td className="px-6 py-3">
                        {deliveries.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {deliveries.map((d) => (
                              <div key={d.id} className="flex items-center gap-2">
                                <StatusBadge status={d.status as DeliveryStatus} />
                                <span className="text-xs text-muted-foreground">
                                  {PROVIDER_LABELS[d.provider] ?? d.provider}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
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
