import { Fragment } from "react"
import type { MarkdownBlock } from "@/lib/markdown"

/**
 * Renders parsed Markdown blocks using Spendly's own type scale and semantic
 * color tokens, so the guide reads as part of the app rather than a dumped
 * text file. Pairs with `parseMarkdown` in `@/lib/markdown`.
 */

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`)/g).filter((part) => part !== "")
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function MarkdownView({ blocks }: { blocks: MarkdownBlock[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            if (block.level === 1) {
              return (
                <h1
                  key={i}
                  className="mt-2 text-2xl font-semibold tracking-tight text-foreground first:mt-0"
                >
                  {renderInline(block.text)}
                </h1>
              )
            }
            if (block.level === 2) {
              return (
                <h2
                  key={i}
                  className="mt-6 text-lg font-semibold tracking-tight text-foreground"
                >
                  {renderInline(block.text)}
                </h2>
              )
            }
            return (
              <h3 key={i} className="mt-3 text-base font-semibold text-foreground">
                {renderInline(block.text)}
              </h3>
            )

          case "paragraph":
            return (
              <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                {renderInline(block.text)}
              </p>
            )

          case "code":
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-xs leading-relaxed text-foreground"
              >
                <code>{block.content}</code>
              </pre>
            )

          case "ul":
            return (
              <ul
                key={i}
                className="flex flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground [&>li]:list-disc"
              >
                {block.items.map((item, j) => (
                  <li key={j}>
                    {renderInline(item.text)}
                    {item.sub ? (
                      <ul className="mt-1.5 flex flex-col gap-1 pl-5 [&>li]:list-[circle]">
                        {item.sub.map((sub, k) => (
                          <li key={k}>{renderInline(sub)}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )

          case "ol":
            return (
              <ol
                key={i}
                className="flex flex-col gap-2 pl-5 text-sm leading-relaxed text-muted-foreground [&>li]:list-decimal [&>li]:marker:font-medium [&>li]:marker:text-foreground"
              >
                {block.items.map((item, j) => (
                  <li key={j}>
                    {renderInline(item.text)}
                    {item.sub ? (
                      <ul className="mt-1.5 flex flex-col gap-1 pl-5 [&>li]:list-[circle]">
                        {item.sub.map((sub, k) => (
                          <li key={k}>{renderInline(sub)}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            )

          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      {block.header.map((cell, j) => (
                        <th key={j} className="px-4 py-2 font-medium whitespace-nowrap">
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                        {row.map((cell, k) => (
                          <td key={k} className="px-4 py-2 align-top text-muted-foreground">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )

          default:
            return null
        }
      })}
    </div>
  )
}
