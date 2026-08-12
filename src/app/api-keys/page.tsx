import type { Metadata } from "next"
import { KeyRound } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export const metadata: Metadata = { title: "API keys" }

export default function ApiKeysPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Generate keys that your Apple Wallet shortcut uses to post
          transactions to Spendly.
        </p>
      </div>
      <EmptyState
        icon={<KeyRound />}
        title="No API keys yet"
        description="Create a key to authenticate your iOS shortcut. The raw value is shown only once."
      />
    </div>
  )
}
