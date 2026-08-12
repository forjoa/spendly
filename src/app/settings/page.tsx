import type { Metadata } from "next"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and preferences.
        </p>
      </div>
    </div>
  )
}
