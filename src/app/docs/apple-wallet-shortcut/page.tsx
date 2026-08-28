import type { Metadata } from "next"
import Link from "next/link"
import { readFileSync } from "fs"
import { join } from "path"
import { ArrowLeft } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { parseMarkdown } from "@/lib/markdown"
import { MarkdownView } from "./markdown-view"

export const metadata: Metadata = {
  title: "Apple Wallet Shortcut setup",
}

function getGuide(): string {
  const filePath = join(process.cwd(), "docs", "apple-wallet-shortcut.md")
  return readFileSync(filePath, "utf-8")
}

export default function AppleWalletShortcutPage() {
  const blocks = parseMarkdown(getGuide())
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
          <Logo />
          <Link
            href="/overview"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Spendly
          </Link>
        </div>
      </header>
      <article className="mx-auto w-full max-w-2xl px-4 py-10">
        <MarkdownView blocks={blocks} />
      </article>
    </div>
  )
}
