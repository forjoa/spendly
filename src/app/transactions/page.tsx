import type { Metadata } from "next"
import { Receipt } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export const metadata: Metadata = { title: "Transactions" }

export default function TransactionsPage() {
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
