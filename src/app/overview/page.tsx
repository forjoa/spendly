import { Receipt } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          A summary of your tracked spending will appear here once transactions
          arrive.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent spending</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Receipt />}
            title="No transactions yet"
            description="Connect an Apple Wallet shortcut and a destination to start tracking expenses automatically."
          />
        </CardContent>
      </Card>
    </div>
  )
}
