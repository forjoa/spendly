import { redirect } from "next/navigation"
import { getSession } from "@/infrastructure/auth/session"
import { Logo } from "@/components/brand/logo"

/*
  Layout for unauthenticated auth pages (sign-in, sign-up). Redirects signed-in
  users to the app. No app shell.
*/

export const dynamic = "force-dynamic"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (session?.user) {
    redirect("/overview")
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        <Logo />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
