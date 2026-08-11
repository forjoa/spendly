import {
  LayoutDashboard,
  ArrowLeftRight,
  Plug,
  KeyRound,
  Settings,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  description: string
}

/**
 * Primary navigation for the authenticated app. These map directly to the
 * V0 surface — no speculative sections.
 */
export const navItems: NavItem[] = [
  {
    title: "Overview",
    href: "/app",
    icon: LayoutDashboard,
    description: "Your account at a glance",
  },
  {
    title: "Transactions",
    href: "/app/transactions",
    icon: ArrowLeftRight,
    description: "Every captured payment",
  },
  {
    title: "Connections",
    href: "/app/connections",
    icon: Plug,
    description: "Where transactions are delivered",
  },
  {
    title: "API keys",
    href: "/app/keys",
    icon: KeyRound,
    description: "Credentials for the iOS Shortcut",
  },
  {
    title: "Settings",
    href: "/app/settings",
    icon: Settings,
    description: "Account preferences",
  },
]
