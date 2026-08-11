import { KeyRound } from "lucide-react"
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

export const metadata: Metadata = { title: "API keys" }

export default function KeysPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="API keys"
        description="API keys let your iOS Shortcut send payments to Spendly securely. A key is shown once at creation — store it somewhere safe."
      />
      <Card className="py-0">
        <CardContent className="p-0">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRound />
              </EmptyMedia>
              <EmptyTitle>No API keys yet</EmptyTitle>
              <EmptyDescription>
                Create a key to authorize the iOS Shortcut. You&apos;ll see the
                full key only once, right after creating it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  )
}
