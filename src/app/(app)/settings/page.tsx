import type { Metadata } from "next"
import { requireUser } from "@/infrastructure/auth/session"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PageHeader } from "@/components/shell/page-header"
import { SignOutButton } from "./sign-out-button"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const { user } = await requireUser()
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Manage your account and preferences." />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your Spendly account details.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{user.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Verified</span>
            <span className="font-medium">{user.emailVerified ? "Yes" : "No"}</span>
          </div>
          <div className="pt-2">
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
