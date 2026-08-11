import { Plug } from "lucide-react"
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

export const metadata: Metadata = { title: "Connections" }

export default function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Connections"
        description="A connection is where Spendly delivers your transactions. For now, that's a Notion database of your choice."
      />
      <Card className="py-0">
        <CardContent className="p-0">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Plug />
              </EmptyMedia>
              <EmptyTitle>No connection yet</EmptyTitle>
              <EmptyDescription>
                Connect a Notion database and every captured transaction will be
                added to it automatically.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  )
}
