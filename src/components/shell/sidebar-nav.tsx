"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { navItems, type NavItem } from "./nav-config"

function isActive(pathname: string, href: string): boolean {
  if (href === "/overview") return pathname === "/overview"
  return pathname === href || pathname.startsWith(href + "/")
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4" />
      {item.title}
    </Link>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const primary = navItems.filter((i) => !i.secondary)
  const secondary = navItems.filter((i) => i.secondary)
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {primary.map((item) => (
        <NavLink key={item.href} item={item} onNavigate={onNavigate} />
      ))}
      {secondary.length > 0 ? (
        <div className="mt-auto pt-4">
          {secondary.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ) : null}
    </nav>
  )
}
