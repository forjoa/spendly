import { ArrowLeftRight } from "lucide-react"
import type { Metadata } from "next"
import { PageHeader } from "@/components/app-shell/page-header"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export const metadata: Metadata = { title: "Transactions" }

export default function TransactionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Transactions"
        description="Every payment Spendly captures, in one place. Captured transactions are delivered to your connected destination automatically."
      />
      <Card className="py-0">
        <CardContent className="p-0">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ArrowLeftRight />
              </EmptyMedia>
              <EmptyTitle>No transactions yet</EmptyTitle>
              <EmptyDescription>
                When your iOS Shortcut sends a payment, it appears here within
                seconds. Nothing to enter by hand.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  )
}
