import { Settings as SettingsIcon } from "lucide-react"
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

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Manage your account and preferences."
      />
      <Card className="py-0">
        <CardContent className="p-0">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SettingsIcon />
              </EmptyMedia>
              <EmptyTitle>Account settings</EmptyTitle>
              <EmptyDescription>
                Your account preferences will live here once sign-in is set up.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  )
}
