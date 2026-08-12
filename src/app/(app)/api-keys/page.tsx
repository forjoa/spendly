import type { Metadata } from "next"
import { KeyRound } from "lucide-react"
import { requireUser } from "@/infrastructure/auth/session"
import * as apiKeyService from "@/domain/api-key/service"
import { EmptyState } from "@/components/ui/empty-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CreateApiKeyDialog } from "./create-key-dialog"
import { RevokeKeyButton } from "./revoke-key-button"

export const metadata: Metadata = { title: "API keys" }

function formatDate(iso: Date | null | undefined): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso))
}

export default async function ApiKeysPage() {
  const { user } = await requireUser()
  const keys = await apiKeyService.listKeys(user.id)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
          <CreateApiKeyDialog />
        </div>
        <p className="text-sm text-muted-foreground">
          Generate keys that your Apple Wallet shortcut uses to post transactions
          to Spendly. The raw value is shown only once at creation. See the{" "}
          <a href="/docs/apple-wallet-shortcut" className="underline underline-offset-2 hover:text-foreground">
            Apple Wallet Shortcut setup guide
          </a>
          .
        </p>
      </div>

      {keys.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title="No API keys yet"
          description="Create a key to authenticate your iOS shortcut. The raw value is shown only once."
          action={<CreateApiKeyDialog />}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your keys</CardTitle>
            <CardDescription>Active and revoked API keys for your account.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-6 py-2 font-medium">Label</th>
                    <th className="px-6 py-2 font-medium">Suffix</th>
                    <th className="px-6 py-2 font-medium">Created</th>
                    <th className="px-6 py-2 font-medium">Last used</th>
                    <th className="px-6 py-2 font-medium">Status</th>
                    <th className="px-6 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => {
                    const revoked = key.revokedAt !== null
                    return (
                      <tr key={key.id} className="border-b last:border-0">
                        <td className="px-6 py-3 font-medium">{key.label}</td>
                        <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                          …{key.keySuffix}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {formatDate(key.createdAt)}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {formatDate(key.lastUsedAt)}
                        </td>
                        <td className="px-6 py-3">
                          {revoked ? (
                            <Badge variant="muted">Revoked</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right">
                          {revoked ? null : (
                            <RevokeKeyButton id={key.id} label={key.label} />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
