import "server-only"
import { DestinationError } from "@/lib/errors"
import type { Transaction } from "@/infrastructure/db/schema"
import { formatMinorUnits } from "@/lib/money"

/*
  Notion destination adapter.

  Delivers a normalized transaction to a Notion database by creating a page
  whose properties map to the transaction fields. Per INTEGRATIONS.md:
  - The transaction domain never contains Notion-specific logic; this adapter
    is the only place that knows about Notion.
  - Errors are sanitized before being surfaced; Notion credentials and raw
    internal errors are never exposed.
*/

const NOTION_API_BASE = "https://api.notion.com/v1"
const DEFAULT_NOTION_API_VERSION = "2022-06-28"
const REQUEST_TIMEOUT_MS = 8_000

export interface NotionDeliveryInput {
  /** The decrypted internal integration token. */
  token: string
  /** The target database id where pages are created. */
  databaseId: string
  /** Optional Notion API version override (defaults to 2022-06-28). */
  apiVersion?: string
  transaction: Transaction
}

export interface NotionDeliveryResult {
  externalDeliveryId: string
}

/**
 * Create a page in the configured Notion database representing a transaction.
 * Returns the created page id. Throws a sanitized DestinationError on
 * failure — never exposes the token or raw Notion error bodies.
 */
export async function deliverToNotion(
  input: NotionDeliveryInput,
): Promise<NotionDeliveryResult> {
  const { token, databaseId, transaction } = input
  const apiVersion =
    input.apiVersion ??
    process.env.NOTION_API_VERSION ??
    DEFAULT_NOTION_API_VERSION

  const url = `${NOTION_API_BASE}/pages`
  const body = buildPagePayload(databaseId, transaction)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": apiVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    throw new DestinationError(
      err instanceof Error && err.name === "AbortError"
        ? "Notion request timed out"
        : "Could not reach Notion",
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new DestinationError(sanitizeNotionError(response.status))
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new DestinationError("Notion returned an unreadable response")
  }

  const pageId = extractPageId(json)
  if (!pageId) {
    throw new DestinationError("Notion did not return a page id")
  }
  return { externalDeliveryId: pageId }
}

/** Map a transaction to a Notion page-creation payload. */
function buildPagePayload(
  databaseId: string,
  tx: Transaction,
): Record<string, unknown> {
  const amountDisplay = formatMinorUnits(tx.amountMinor, tx.currency)
  return {
    parent: { database_id: databaseId },
    properties: {
      Merchant: { title: [{ text: { content: tx.merchant } }] },
      Amount: {
        rich_text: [{ text: { content: amountDisplay } }],
      },
      Currency: { select: { name: tx.currency } },
      Date: {
        date: { start: tx.date.toISOString() },
      },
      Type: { select: { name: tx.type } },
      Category: tx.category
        ? { rich_text: [{ text: { content: tx.category } }] }
        : undefined,
      Source: { rich_text: [{ text: { content: tx.source } }] },
      "External ID": {
        rich_text: [{ text: { content: tx.externalId } }],
      },
    },
  }
}

/** Extract the page id from a Notion create-page response. */
function extractPageId(json: unknown): string | undefined {
  if (
    typeof json === "object" &&
    json !== null &&
    "id" in json &&
    typeof (json as { id: unknown }).id === "string"
  ) {
    return (json as { id: string }).id
  }
  return undefined
}

/** Map Notion HTTP errors to a safe, credential-free summary. */
function sanitizeNotionError(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "Notion rejected the integration token"
    case 404:
      return "Notion database was not found or is not shared with the integration"
    case 400:
      return "Notion rejected the transaction payload"
    case 429:
      return "Notion rate limit reached"
    default:
      return `Notion request failed (HTTP ${status})`
  }
}
