import { describe, it, expect } from "vitest"
import { parseMarkdown } from "./markdown"

describe("parseMarkdown", () => {
  it("parses headings of each level", () => {
    const blocks = parseMarkdown("# Title\n\n## Section\n\n### Sub")
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "heading", level: 2, text: "Section" },
      { type: "heading", level: 3, text: "Sub" },
    ])
  })

  it("joins consecutive lines into one paragraph", () => {
    const blocks = parseMarkdown("First line\nsecond line.\n\nNew paragraph.")
    expect(blocks).toEqual([
      { type: "paragraph", text: "First line second line." },
      { type: "paragraph", text: "New paragraph." },
    ])
  })

  it("parses a fenced code block and preserves its content verbatim", () => {
    const blocks = parseMarkdown('```json\n{\n  "a": 1\n}\n```')
    expect(blocks).toEqual([{ type: "code", lang: "json", content: '{\n  "a": 1\n}' }])
  })

  it("parses a code block with no language", () => {
    const blocks = parseMarkdown("```\nplain text\n```")
    expect(blocks).toEqual([{ type: "code", lang: undefined, content: "plain text" }])
  })

  it("parses a table with a header and rows", () => {
    const source = ["| A | B |", "|---|---|", "| 1 | 2 |", "| 3 | 4 |"].join("\n")
    const blocks = parseMarkdown(source)
    expect(blocks).toEqual([
      {
        type: "table",
        header: ["A", "B"],
        rows: [
          ["1", "2"],
          ["3", "4"],
        ],
      },
    ])
  })

  it("parses an ordered list, including nested bullets under one item", () => {
    const source = [
      "1. First",
      "2. Second",
      "   - nested a",
      "   - nested b",
      "3. Third",
    ].join("\n")
    const blocks = parseMarkdown(source)
    expect(blocks).toEqual([
      {
        type: "ol",
        items: [
          { text: "First" },
          { text: "Second", sub: ["nested a", "nested b"] },
          { text: "Third" },
        ],
      },
    ])
  })

  it("parses a top-level unordered list", () => {
    const blocks = parseMarkdown("- one\n- two\n- three")
    expect(blocks).toEqual([
      { type: "ul", items: [{ text: "one" }, { text: "two" }, { text: "three" }] },
    ])
  })

  it("parses nested bullets under an unordered list item", () => {
    const source = ["- URL: example.com", "  - detail one", "- Method: POST"].join("\n")
    const blocks = parseMarkdown(source)
    expect(blocks).toEqual([
      {
        type: "ul",
        items: [
          { text: "URL: example.com", sub: ["detail one"] },
          { text: "Method: POST" },
        ],
      },
    ])
  })

  it("does not confuse a table row for a bullet list item", () => {
    const source = ["| Field | Example |", "|---|---|", "| merchant | Coffee Shop |"].join(
      "\n",
    )
    const blocks = parseMarkdown(source)
    expect(blocks[0]).toMatchObject({ type: "table" })
  })

  it("round-trips the real docs file without throwing and produces blocks", () => {
    const source = `# Guide\n\nIntro paragraph.\n\n## Part 1\n\n1. Step one\n2. Step two\n\n\`\`\`\nsk_live_example\n\`\`\`\n`
    const blocks = parseMarkdown(source)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.some((b) => b.type === "code")).toBe(true)
    expect(blocks.some((b) => b.type === "ol")).toBe(true)
  })
})
