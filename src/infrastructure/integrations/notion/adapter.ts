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
    internal errors are never exposed to the client.
  - The original Notion error is logged server-side (without the token) so
    integration failures can be diagnosed.

  Schema awareness: before creating a page, the adapter fetches the target
  database schema (GET /v1/databases/{id}) and maps each transaction field to
  the actual property type Notion reports. This avoids 400 validation errors
  caused by type mismatches (e.g. sending rich_text to a number property) or
  by sending a property the database does not have (e.g. Category).
*/

const NOTION_API_BASE = "https://api.notion.com/v1"
const DEFAULT_NOTION_API_VERSION = "2022-06-28"
const REQUEST_TIMEOUT_MS = 8_000

/** Property names documented in docs/apple-wallet-shortcut.md. */
const REQUIRED_PROPERTIES = [
  "Merchant",
  "Amount",
  "Currency",
  "Date",
  "Type",
  "Source",
  "External ID",
] as const

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
 * failure — never exposes the token or raw Notion error bodies to the
 * client. The original Notion error is logged server-side for diagnostics.
 */
export async function deliverToNotion(
  input: NotionDeliveryInput,
): Promise<NotionDeliveryResult> {
  const { token, databaseId, transaction } = input
  const apiVersion =
    input.apiVersion ??
    process.env.NOTION_API_VERSION ??
    DEFAULT_NOTION_API_VERSION

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": apiVersion,
    "Content-Type": "application/json",
  }

  // 1. Fetch the database schema so we can map to actual property types.
  const dbSchema = await fetchDatabaseSchema(databaseId, headers)
  const properties = buildProperties(transaction, dbSchema)

  // 2. Create the page with the schema-aware payload.
  const url = `${NOTION_API_BASE}/pages`
  const body = { parent: { database_id: databaseId }, properties }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
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
    // Read the Notion error body and log it server-side for diagnostics.
    // The token is only in the request header, never in the response body.
    const errorDetail = await readNotionError(response)
    console.error(
      `[notion] page creation failed for database ${databaseId}: ` +
        `HTTP ${response.status} ${errorDetail.code} — ${errorDetail.message}`,
    )
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

// ── schema fetch ───────────────────────────────────────────────────────

/** A Notion database property as returned by GET /v1/databases/{id}. */
interface NotionProperty {
  type: string
}

/** Shape of the properties object in a Notion database response. */
type NotionPropertiesMap = Record<string, NotionProperty>

/**
 * Fetch the target database and return its property map. Throws a sanitized
 * DestinationError on failure, logging the original Notion error server-side.
 */
async function fetchDatabaseSchema(
  databaseId: string,
  headers: Record<string, string>,
): Promise<NotionPropertiesMap> {
  const url = `${NOTION_API_BASE}/databases/${databaseId}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    throw new DestinationError(
      err instanceof Error && err.name === "AbortError"
        ? "Notion schema request timed out"
        : "Could not reach Notion to read database schema",
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const errorDetail = await readNotionError(response)
    console.error(
      `[notion] could not fetch database schema for ${databaseId}: ` +
        `HTTP ${response.status} ${errorDetail.code} — ${errorDetail.message}`,
    )
    throw new DestinationError(sanitizeNotionError(response.status))
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new DestinationError("Notion returned an unreadable database schema")
  }

  const props = extractProperties(json)
  if (!props) {
    throw new DestinationError("Notion database schema has no properties")
  }
  return props
}

/** Extract the properties map from a Notion database response. */
function extractProperties(json: unknown): NotionPropertiesMap | undefined {
  if (
    typeof json === "object" &&
    json !== null &&
    "properties" in json &&
    typeof (json as { properties: unknown }).properties === "object" &&
    (json as { properties: unknown }).properties !== null
  ) {
    return (json as { properties: NotionPropertiesMap }).properties
  }
  return undefined
}

// ── payload building ───────────────────────────────────────────────────

/**
 * Build the Notion page properties for a transaction, mapping each field to
 * the actual property type in the destination database.
 *
 * Required properties (Merchant, Amount, Currency, Date, Type, Source,
 * External ID) must be present. If one is missing, a DestinationError is
 * thrown with a diagnostic naming the missing property.
 *
 * Optional properties (Category) are only included when the database has a
 * matching property — undocumented properties are never sent.
 */
function buildProperties(
  tx: Transaction,
  dbSchema: NotionPropertiesMap,
): Record<string, unknown> {
  // Validate required properties exist in the database.
  const missing = REQUIRED_PROPERTIES.filter(
    (name) => !Object.prototype.hasOwnProperty.call(dbSchema, name),
  )
  if (missing.length > 0) {
    const detail = missing.join(", ")
    console.error(
      `[notion] database is missing required properties: ${detail}. ` +
        `Present properties: ${Object.keys(dbSchema).join(", ")}`,
    )
    throw new DestinationError(
      `Notion database is missing required properties: ${missing.join(", ")}`,
    )
  }

  const properties: Record<string, unknown> = {}

  // Merchant — documented as title.
  properties["Merchant"] = mapTitle(dbSchema["Merchant"]!, tx.merchant)

  // Amount — documented as text/rich_text, formatted as a currency string.
  properties["Amount"] = mapText(
    dbSchema["Amount"]!,
    formatMinorUnits(tx.amountMinor, tx.currency),
  )

  // Currency — documented as select.
  properties["Currency"] = mapSelect(dbSchema["Currency"]!, tx.currency)

  // Date — documented as date.
  properties["Date"] = mapDate(dbSchema["Date"]!, tx.date)

  // Type — documented as select.
  properties["Type"] = mapSelect(dbSchema["Type"]!, tx.type)

  // Source — documented as text/rich_text.
  properties["Source"] = mapText(dbSchema["Source"]!, tx.source)

  // External ID — documented as text/rich_text.
  properties["External ID"] = mapText(dbSchema["External ID"]!, tx.externalId)

  // Category — optional, only when the database explicitly has the property.
  if (
    tx.category &&
    Object.prototype.hasOwnProperty.call(dbSchema, "Category")
  ) {
    properties["Category"] = mapText(dbSchema["Category"]!, tx.category)
  }

  return properties
}

/** Map a text value to the property type, adapting where safe. */
function mapText(prop: NotionProperty, value: string): unknown {
  switch (prop.type) {
    case "rich_text":
      return { rich_text: [{ text: { content: value } }] }
    case "title":
      return { title: [{ text: { content: value } }] }
    case "url":
      return { url: value }
    case "email":
      return { email: value }
    case "phone_number":
      return { phone_number: value }
    case "number":
      return { number: Number(value) }
    default:
      // Fallback: treat as rich_text (the documented type).
      return { rich_text: [{ text: { content: value } }] }
  }
}

/** Map a merchant/title value to the property type. */
function mapTitle(prop: NotionProperty, value: string): unknown {
  switch (prop.type) {
    case "title":
      return { title: [{ text: { content: value } }] }
    case "rich_text":
      return { rich_text: [{ text: { content: value } }] }
    default:
      return { title: [{ text: { content: value } }] }
  }
}

/** Map a select value to the property type, adapting where safe. */
function mapSelect(prop: NotionProperty, value: string): unknown {
  switch (prop.type) {
    case "select":
      return { select: { name: value } }
    case "multi_select":
      return { multi_select: [{ name: value }] }
    case "rich_text":
      return { rich_text: [{ text: { content: value } }] }
    default:
      return { select: { name: value } }
  }
}

/** Map a date value to the property type. */
function mapDate(prop: NotionProperty, value: Date): unknown {
  switch (prop.type) {
    case "date":
      return { date: { start: value.toISOString() } }
    case "created_time":
    case "last_edited_time":
      // Read-only via the API; Notion auto-populates these. Skip silently.
      return undefined
    case "rich_text":
      return { rich_text: [{ text: { content: value.toISOString() } }] }
    default:
      return { date: { start: value.toISOString() } }
  }
}

// ── error handling ─────────────────────────────────────────────────────

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

interface NotionErrorDetail {
  code: string
  message: string
}

/**
 * Read and return the Notion error body from a non-OK response.
 * The token is never present in the response body, so this is safe to log.
 */
async function readNotionError(response: Response): Promise<NotionErrorDetail> {
  try {
    const json = (await response.json()) as {
      code?: string
      message?: string
    }
    return {
      code: json.code ?? "unknown",
      message: json.message ?? "",
    }
  } catch {
    return { code: "unreadable", message: "" }
  }
}

/** Map Notion HTTP errors to a safe, credential-free client-facing summary. */
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
