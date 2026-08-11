import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { SidebarNav } from "@/components/app-shell/sidebar-nav"
import { TopBar } from "@/components/app-shell/top-bar"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh w-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/app" aria-label="Spendly home">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav />
        </div>
        <div className="border-t border-border p-4">
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
            Expenses that track themselves.
          </p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-4 py-8 md:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
