import type { Metadata } from "next"
import { HandCoins } from "lucide-react"
import { requireUser } from "@/infrastructure/auth/session"
import { listRules, materializeDueRules } from "@/domain/recurring/service"
import { listTransactions } from "@/domain/transaction/service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Amount } from "@/components/ui/amount"
import { Badge } from "@/components/ui/badge"
import { formatTransactionDate } from "@/lib/money"
import { PageHeader } from "@/components/shell/page-header"
import { RecurringRuleDialog } from "../_components/recurring-rule-dialog"
import { AddTransactionDialog } from "../_components/add-transaction-dialog"
import { RuleTable } from "../_components/rule-table"

export const metadata: Metadata = { title: "Income" }

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  recurring: "Recurring",
  apple_wallet: "Apple Wallet",
}

/*
  /income — the money the user receives.

  Two kinds of income, side by side:
  - Recurring income: configured once (salary every month on the 25th);
    Spendly records each occurrence automatically.
  - One-time income: recorded by hand (a freelance payment); never repeats.
*/
export default async function IncomePage() {
  const { user } = await requireUser()
  await materializeDueRules(user.id)
  const [rules, incomeTransactions] = await Promise.all([
    listRules(user.id),
    listTransactions(user.id, 100, { type: "income" }),
  ])
  const incomeRules = rules.filter((r) => r.type === "income")

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Income"
        description="Register the money you receive — recurring income is recorded automatically on each scheduled date."
        actions={
          <>
            <AddTransactionDialog
              fixedType="income"
              triggerLabel="Add one-time income"
              triggerVariant="outline"
            />
            <RecurringRuleDialog fixedType="income" triggerLabel="Add recurring income" />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Recurring income</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {incomeRules.length === 0 ? (
            <div className="px-6 py-4">
              <EmptyState
                icon={<HandCoins />}
                title="No recurring income yet"
                description="Add your salary once — e.g. €2,400 monthly on the 25th — and Spendly records it every month."
              />
            </div>
          ) : (
            <RuleTable rules={incomeRules} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Income history</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {incomeTransactions.length === 0 ? (
            <div className="px-6 py-4">
              <EmptyState
                icon={<HandCoins />}
                title="No income recorded yet"
                description="One-time income you add and occurrences of your recurring income appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-6 py-2 font-medium">Name</th>
                    <th className="px-6 py-2 font-medium text-right">Amount</th>
                    <th className="px-6 py-2 font-medium">Date</th>
                    <th className="px-6 py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeTransactions.map((tx) => (
                    <tr key={tx.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-6 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{tx.merchant}</span>
                          {tx.category ? (
                            <span className="text-xs text-muted-foreground">{tx.category}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Amount
                          minor={tx.amountMinor}
                          currency={tx.currency}
                          signed
                          className="font-medium"
                        />
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {formatTransactionDate(tx.date.toISOString())}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={tx.source === "recurring" ? "secondary" : "muted"}>
                          {SOURCE_LABELS[tx.source] ?? tx.source}
                        </Badge>
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
