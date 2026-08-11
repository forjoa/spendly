import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" aria-label="Spendly home">
          <Logo />
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/app">Open app</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
