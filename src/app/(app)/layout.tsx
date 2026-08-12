import { redirect } from "next/navigation"
import { getSession } from "@/infrastructure/auth/session"
import { AppShell } from "@/components/shell/app-shell"

/*
  Layout for authenticated app pages. Redirects unauthenticated users to the
  sign-in page, preserving the intended destination as a callback.

  All app pages depend on the session, so they are rendered on demand.
*/

export const dynamic = "force-dynamic"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session?.user) {
    const params = new URLSearchParams({ callbackUrl: "/overview" })
    redirect(`/sign-in?${params.toString()}`)
  }
  return <AppShell>{children}</AppShell>
}
