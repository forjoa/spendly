import type { Metadata } from "next"
import { Plug } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export const metadata: Metadata = { title: "Connections" }

export default function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Connect the sources that feed transactions into Spendly and the
          destinations that receive them.
        </p>
      </div>
      <EmptyState
        icon={<Plug />}
        title="No connections yet"
        description="Add a destination like Notion and set up an Apple Wallet shortcut to start the flow."
      />
    </div>
  )
}
