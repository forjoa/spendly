import "server-only"

/**
 * Produce a safe, value-free summary of the raw request body for the
 * `transaction.body.parsed` log event.
 *
 * The Spendly transaction flow can only be debugged against a REAL Apple
 * Wallet payload, which we cannot reproduce locally. This summary records
 * exactly which fields arrived and their type/length, WITHOUT recording
 * values — so the next 422 from a real purchase will show precisely which
 * field shape Apple Wallet produced.
 *
 * Only known schema fields are described in detail; any extra fields are
 * reported by name+type so we can spot unexpected keys without leaking data.
 */

const SCHEMA_FIELDS = [
  "merchant",
  "amountMinor",
  "currency",
  "date",
  "type",
  "category",
  "subcategory",
  "source",
  "account",
  "paymentMethod",
  "externalId",
] as const

export interface FieldSummary {
  present: boolean
  type?: string
  length?: number
}

export interface BodySummary {
  bodyType: "object" | "array" | "unknown"
  itemCount: number
  fields?: Record<string, FieldSummary>
  extraFields?: string[]
}

/**
 * Summarize a parsed body value. Values are never included. For objects, the
 * per-field map records presence, JS type, and length (string/array length or
 * stringified length for numbers). For arrays, the first item's field map is
 * used as a representative sample plus the array length.
 */
export function summarizeBody(body: unknown): BodySummary {
  if (Array.isArray(body)) {
    const first = body[0]
    const base: BodySummary = {
      bodyType: "array",
      itemCount: body.length,
    }
    if (first && typeof first === "object") {
      const { fields, extraFields } = summarizeObjectFields(first)
      base.fields = fields
      base.extraFields = extraFields
    }
    return base
  }

  if (body && typeof body === "object") {
    const { fields, extraFields } = summarizeObjectFields(body)
    return {
      bodyType: "object",
      itemCount: 1,
      fields,
      extraFields,
    }
  }

  return { bodyType: "unknown", itemCount: 0 }
}

function summarizeObjectFields(
  obj: object,
): { fields: Record<string, FieldSummary>; extraFields: string[] } {
  const source = obj as Record<string, unknown>
  const fields: Record<string, FieldSummary> = {}
  const extraFields: string[] = []

  const known = new Set<string>(SCHEMA_FIELDS)
  for (const key of SCHEMA_FIELDS) {
    fields[key] = describeField(source[key])
  }
  for (const key of Object.keys(source)) {
    if (!known.has(key)) {
      extraFields.push(key)
    }
  }

  return { fields, extraFields }
}

function describeField(value: unknown): FieldSummary {
  if (value === undefined) {
    return { present: false }
  }
  // `null` is a present value (Zod `nullish()` accepts it). Record its type
  // so a stray null that breaks validation is visible in the summary.
  if (value === null) {
    return { present: true, type: "null" }
  }
  const type = typeof value
  const summary: FieldSummary = { present: true, type }
  if (type === "string") {
    summary.length = (value as string).length
  } else if (type === "number" && Number.isFinite(value)) {
    // Stringify length gives a sense of magnitude without the value itself.
    summary.length = String(value).length
  } else if (Array.isArray(value)) {
    summary.type = "array"
    summary.length = value.length
  }
  return summary
}
