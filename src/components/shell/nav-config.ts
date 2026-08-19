import {
  LayoutDashboard,
  Receipt,
  Plug,
  KeyRound,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  /** Hide from the main nav (e.g. secondary links). */
  secondary?: boolean
}

export const navItems: NavItem[] = [
  { title: "Overview", href: "/overview", icon: LayoutDashboard },
  { title: "Transactions", href: "/transactions", icon: Receipt },
  { title: "Connections", href: "/connections", icon: Plug },
  { title: "API keys", href: "/api-keys", icon: KeyRound },
  { title: "Logs", href: "/logs", icon: ScrollText },
  { title: "Settings", href: "/settings", icon: Settings, secondary: true },
]
