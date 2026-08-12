"use client"
import * as React from "react"
import { Menu, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SidebarNav } from "./sidebar-nav"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="size-4 hidden dark:block" />
      <Moon className="size-4 block dark:hidden" />
    </Button>
  )
}

function DesktopSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-5">
        <Logo />
      </div>
      <div className="flex flex-1 flex-col px-3 py-4">
        <SidebarNav />
      </div>
    </aside>
  )
}

function MobileTopbar({
  children,
  open,
  onOpenChange,
}: {
  children?: React.ReactNode
  open: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation menu">
            <Menu className="size-5" />
          </Button>
        </DialogTrigger>
        <DialogContent
          showClose={false}
          className="left-0 top-0 h-dvh w-72 max-w-[80vw] translate-x-0 translate-y-0 rounded-none border-r sm:max-w-[80vw]"
        >
          <DialogHeader className="border-b pb-4 text-left">
            <DialogTitle asChild>
              <div className="flex items-center justify-between">
                <Logo />
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <SidebarNav
              onNavigate={() => {
                onOpenChange?.(false)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex items-center gap-2">
        <Logo />
      </div>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  )
}

function DesktopTopbar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="hidden h-14 items-center gap-2 border-b px-6 md:flex">
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  return (
    <div className="flex min-h-dvh bg-background">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopbar open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <ThemeToggle />
        </MobileTopbar>
        <DesktopTopbar>
          <ThemeToggle />
        </DesktopTopbar>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
