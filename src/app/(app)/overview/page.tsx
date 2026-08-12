import { Receipt } from "lucide-react"
import { requireUser } from "@/infrastructure/auth/session"
import { listTransactionsWithDeliveries } from "@/domain/transaction/service"
import { listConnections } from "@/domain/connection/service"
import * as apiKeyService from "@/domain/api-key/service"
import { EmptyState } from "@/components/ui/empty-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Amount } from "@/components/ui/amount"
import { formatTransactionDate } from "@/lib/money"

export default async function OverviewPage() {
  const { user } = await requireUser()
  const [rows, connections, keys] = await Promise.all([
    listTransactionsWithDeliveries(user.id, 5),
    listConnections(user.id),
    apiKeyService.listActiveKeys(user.id),
  ])

  const hasNothing = rows.length === 0 && connections.length === 0 && keys.length === 0
  const expenses = rows.filter((r) => r.transaction.type === "expense")
  const totalMinor = expenses.reduce(
    (sum, r) => sum + r.transaction.amountMinor,
    0,
  )
  const currency = expenses[0]?.transaction.currency ?? "USD"

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {user.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          A summary of your tracked spending will appear here once transactions
          arrive.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Recent expenses</CardDescription>
            <CardTitle className="text-2xl">
              <Amount minor={totalMinor} currency={currency} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {expenses.length} expense{expenses.length === 1 ? "" : "s"} in the last 5 transactions
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Connections</CardDescription>
            <CardTitle className="text-2xl">{connections.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {connections.length === 0
                ? "No destinations connected"
                : `${connections.filter((c) => c.enabled).length} enabled`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>API keys</CardDescription>
            <CardTitle className="text-2xl">{keys.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {keys.length === 0 ? "No active keys" : "Active keys for ingestion"}
            </p>
          </CardContent>
        </Card>
      </div>

      {hasNothing ? (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Three steps to start tracking expenses automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<Receipt />}
              title="Set up your flow"
              description="Create an API key, connect Notion, then point your Apple Wallet shortcut at Spendly."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recent spending</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {rows.length === 0 ? (
              <div className="px-6 py-4">
                <EmptyState
                  icon={<Receipt />}
                  title="No transactions yet"
                  description="Connect an Apple Wallet shortcut and a destination to start tracking expenses automatically."
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
                    {rows.map(({ transaction }) => (
                      <tr key={transaction.id} className="border-b last:border-0">
                        <td className="px-6 py-3 font-medium">{transaction.merchant}</td>
                        <td className="px-6 py-3 text-right">
                          <Amount
                            minor={transaction.amountMinor}
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
      )}
    </div>
  )
}
