/**
 * Minimal Markdown → block parser for Spendly's own docs content (currently
 * `docs/apple-wallet-shortcut.md`). Not a general-purpose Markdown engine —
 * it covers exactly the subset our docs use (headings, paragraphs, fenced
 * code, tables, ordered/unordered lists with one level of nesting, inline
 * code spans) so the guide renders as real typography instead of raw
 * Markdown syntax, without pulling in a Markdown dependency for one file we
 * fully control.
 *
 * No side effects, no framework imports — safe to unit test in isolation.
 */

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang?: string; content: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "ol"; items: MarkdownListItem[] }
  | { type: "ul"; items: MarkdownListItem[] }

export interface MarkdownListItem {
  text: string
  /** One level of nested bullets indented under this item, if any. */
  sub?: string[]
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/
const ORDERED_ITEM_RE = /^\d+\.\s+(.*)$/
const NESTED_BULLET_RE = /^\s{2,}-\s+(.*)$/
const BULLET_ITEM_RE = /^-\s+(.*)$/
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split("|").map((cell) => cell.trim())
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith("```") ||
    HEADING_RE.test(line) ||
    ORDERED_ITEM_RE.test(line) ||
    BULLET_ITEM_RE.test(line) ||
    line.includes("|")
  )
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ""

    if (line.trim() === "") {
      i++
      continue
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || undefined
      i++
      const content: string[] = []
      while (i < lines.length && lines[i]?.trim() !== "```") {
        content.push(lines[i] ?? "")
        i++
      }
      i++ // skip closing fence
      blocks.push({ type: "code", lang, content: content.join("\n") })
      continue
    }

    const heading = line.match(HEADING_RE)
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      })
      i++
      continue
    }

    const next = lines[i + 1]
    if (line.includes("|") && next !== undefined && TABLE_SEPARATOR_RE.test(next)) {
      const header = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && (lines[i] ?? "").includes("|") && lines[i]?.trim() !== "") {
        rows.push(splitTableRow(lines[i]!))
        i++
      }
      blocks.push({ type: "table", header, rows })
      continue
    }

    if (ORDERED_ITEM_RE.test(line)) {
      const items: MarkdownListItem[] = []
      while (i < lines.length && ORDERED_ITEM_RE.test(lines[i] ?? "")) {
        const text = lines[i]!.match(ORDERED_ITEM_RE)![1]!.trim()
        i++
        const sub: string[] = []
        while (i < lines.length && NESTED_BULLET_RE.test(lines[i] ?? "")) {
          sub.push(lines[i]!.match(NESTED_BULLET_RE)![1]!.trim())
          i++
        }
        items.push(sub.length > 0 ? { text, sub } : { text })
      }
      blocks.push({ type: "ol", items })
      continue
    }

    if (BULLET_ITEM_RE.test(line)) {
      const items: MarkdownListItem[] = []
      while (i < lines.length && BULLET_ITEM_RE.test(lines[i] ?? "")) {
        const text = lines[i]!.match(BULLET_ITEM_RE)![1]!.trim()
        i++
        const sub: string[] = []
        while (i < lines.length && NESTED_BULLET_RE.test(lines[i] ?? "")) {
          sub.push(lines[i]!.match(NESTED_BULLET_RE)![1]!.trim())
          i++
        }
        items.push(sub.length > 0 ? { text, sub } : { text })
      }
      blocks.push({ type: "ul", items })
      continue
    }

    // Paragraph: gather lines until a blank line or the next block starts.
    const buf: string[] = [line.trim()]
    i++
    while (i < lines.length && lines[i]?.trim() !== "" && !isBlockStart(lines[i] ?? "")) {
      buf.push(lines[i]!.trim())
      i++
    }
    blocks.push({ type: "paragraph", text: buf.join(" ") })
  }

  return blocks
}
