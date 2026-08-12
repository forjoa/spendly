import type { Metadata } from "next"
import { requireUser } from "@/infrastructure/auth/session"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SignOutButton } from "./sign-out-button"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const { user } = await requireUser()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and preferences.
        </p>
      </div>
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
