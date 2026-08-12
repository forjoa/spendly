import type { Metadata } from "next"
import { Plug } from "lucide-react"
import { requireUser } from "@/infrastructure/auth/session"
import { listConnections } from "@/domain/connection/service"
import { EmptyState } from "@/components/ui/empty-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CreateConnectionDialog } from "./create-connection-dialog"
import { DeleteConnectionButton } from "./delete-connection-button"

export const metadata: Metadata = { title: "Connections" }

const PROVIDER_LABELS: Record<string, string> = {
  notion: "Notion",
  google_sheets: "Google Sheets",
  ynab: "YNAB",
  webhook: "Webhook",
  custom_api: "Custom API",
}

export default async function ConnectionsPage() {
  const { user } = await requireUser()
  const connections = await listConnections(user.id)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
          <CreateConnectionDialog />
        </div>
        <p className="text-sm text-muted-foreground">
          Spendly sends each transaction to your connected Notion database.
        </p>
      </div>

      {connections.length === 0 ? (
        <EmptyState
          icon={<Plug />}
          title="No connections yet"
          description="Add a destination like Notion and set up an Apple Wallet shortcut to start the flow."
          action={<CreateConnectionDialog />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {connections.map((conn) => (
            <Card key={conn.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    {conn.label}
                    {conn.enabled ? (
                      <Badge variant="success">Connected</Badge>
                    ) : (
                      <Badge variant="muted">Disabled</Badge>
                    )}
                  </CardTitle>
                  <DeleteConnectionButton id={conn.id} label={conn.label} />
                </div>
                <CardDescription>
                  {PROVIDER_LABELS[conn.provider] ?? conn.provider}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Added {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }).format(new Date(conn.createdAt))}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
