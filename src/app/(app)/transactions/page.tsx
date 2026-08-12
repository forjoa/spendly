import type { Metadata } from "next"
import { Receipt } from "lucide-react"
import { requireUser } from "@/infrastructure/auth/session"
import { listTransactionsWithDeliveries } from "@/domain/transaction/service"
import { EmptyState } from "@/components/ui/empty-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Amount } from "@/components/ui/amount"
import { StatusBadge, type DeliveryStatus } from "@/components/ui/status-badge"
import { formatTransactionDate } from "@/lib/money"

export const metadata: Metadata = { title: "Transactions" }

const PROVIDER_LABELS: Record<string, string> = {
  notion: "Notion",
  google_sheets: "Google Sheets",
  ynab: "YNAB",
  webhook: "Webhook",
  custom_api: "Custom API",
}

export default async function TransactionsPage() {
  const { user } = await requireUser()
  const rows = await listTransactionsWithDeliveries(user.id, 50)

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Every payment Spendly receives, normalized and ready to deliver.
          </p>
        </div>
        <EmptyState
          icon={<Receipt />}
          title="No transactions yet"
          description="Transactions appear here as soon as your Apple Wallet shortcut sends a payment."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Every payment Spendly receives, normalized and ready to deliver.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-6 py-2 font-medium">Merchant</th>
                  <th className="px-6 py-2 font-medium text-right">Amount</th>
                  <th className="px-6 py-2 font-medium">Date</th>
                  <th className="px-6 py-2 font-medium">Source</th>
                  <th className="px-6 py-2 font-medium">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ transaction, deliveries }) => (
                  <tr key={transaction.id} className="border-b last:border-0">
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
                        minor={transaction.amountMinor}
                        currency={transaction.currency}
                        signed
                        className="font-medium"
                      />
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {formatTransactionDate(transaction.date.toISOString())}
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
        </CardContent>
      </Card>
    </div>
  )
}
