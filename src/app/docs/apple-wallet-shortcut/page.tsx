import type { Metadata } from "next"
import { readFileSync } from "fs"
import { join } from "path"

export const metadata: Metadata = {
  title: "Apple Wallet Shortcut setup",
}

function getGuide(): string {
  const filePath = join(process.cwd(), "docs", "apple-wallet-shortcut.md")
  return readFileSync(filePath, "utf-8")
}

export default function AppleWalletShortcutPage() {
  const guide = getGuide()
  return (
    <article className="prose prose-sm dark:prose-invert mx-auto max-w-2xl">
      <pre className="whitespace-pre-wrap bg-transparent p-0 font-sans text-sm leading-relaxed">
        {guide}
      </pre>
    </article>
  )
}
