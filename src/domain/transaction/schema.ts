import { z } from "zod"
import { normalizeCurrency, minorUnitExponent } from "@/lib/money"

/*
  Transaction domain schemas (Zod).

  These define the shape of a normalized transaction as it enters and leaves
  the system. Source: INTEGRATIONS.md "Normalized transaction".
*/

export const transactionTypeSchema = z.enum([
  "expense",
  "income",
  "transfer",
  "refund",
])

/**
 * Boundary contract for money in minor units.
 *
 * JSON has no integer type: every JSON number is a double, and some clients
 * (e.g. iOS Shortcuts) cannot emit anything else. The boundary accepts any
 * number whose value is an exact safe integer (in JSON, 599 and 599.0 are
 * the same number) and guarantees the domain receives an integer.
 *
 * Fractional values (599.5, 5.99, 298.99999999999997) and strings ("599")
 * are rejected — never rounded, truncated, or coerced. Silently "fixing" an
 * amount would corrupt money. This applies to every source, not just
 * Apple Shortcuts; source quirks stay at the boundary.
 */
export const amountMinorSchema = z
  .number({ error: "amountMinor must be a JSON number; strings are not accepted" })
  .int({ error: "amountMinor must be an integer in minor units; fractional values are rejected, never rounded" })
  .finite({ error: "amountMinor must be finite" })

/**
 * Convert a major-unit value (string or number like "10.50" or 10.5) into
 * minor units using the currency's exponent (from src/lib/money). Throws
 * on invalid format or if there are more fractional digits than allowed.
 */
function majorToMinor(value: string | number, currency: string): number {
  const exp = minorUnitExponent(currency)
  if (!currency) throw new Error("currency required to convert amount")

  const asString = typeof value === "number" ? value.toString() : (value ?? "").toString()
  const s = asString.trim()
  const match = s.match(/^([+-])?(\d+)(?:\.(\d+))?$/)
  if (!match) throw new Error("invalid numeric format")

  const sign = match[1] === "-" ? -1 : 1
  const integerPart = match[2]
  const fractionPart = match[3] ?? ""

  if (fractionPart.length > exp) {
    throw new Error(`too many decimal places for ${currency} (max ${exp})`)
  }

  const fracPadded = fractionPart.padEnd(exp, "0")
  const combined = integerPart + fracPadded
  const normalized = combined.replace(/^0+(?!$)/, "") || "0"
  const minor = Number(normalized) * sign
  if (!Number.isSafeInteger(minor)) throw new Error("amount out of safe integer range")
  return minor
}

/**
 * The normalized transaction accepted by the Spendly API.
 * `amountMinor` is an integer in the currency's minor units (e.g. cents).
 *
 * We accept a couple of convenient input shapes at the boundary to support
 * legacy/quirky clients (Apple Shortcuts):
 *  - amountMinor (integer) — the canonical input
 *  - amountMinor (decimal) + currency — interpreted as major units and
 *    converted to minor units
 *  - amount (string|number) + currency — converted to amountMinor
 *
 * These conversions are conservative: they do not round. If the client sends
 * more fractional digits than the currency supports we reject the request.
 */
export const transactionInputSchema = z.preprocess((raw) => {
  if (typeof raw !== "object" || raw === null) return raw
  const obj = raw as Record<string, unknown>

  // If amountMinor is present, normalize/convert when necessary
  if (obj.amountMinor !== undefined) {
    const am = obj.amountMinor
    // integer number OK
    if (typeof am === "number" && Number.isInteger(am)) return obj
    // string integer -> coerce to number
    if (typeof am === "string" && /^\s*[+-]?\d+\s*$/.test(am)) {
      return { ...obj, amountMinor: Number(am.trim()) }
    }
    // fractional number or decimal string -> attempt conversion using currency
    if (
      (typeof am === "number" && !Number.isInteger(am)) ||
      (typeof am === "string" && /^\s*[+-]?\d+\.\d+\s*$/.test(am))
    ) {
      if (typeof obj.currency !== "string" || obj.currency.trim() === "") {
        // cannot convert without currency — leave raw so validation will fail
        return obj
      }
      try {
        const minor = majorToMinor(am as string | number, obj.currency as string)
        return { ...obj, amountMinor: minor }
      } catch (e) {
        return obj
      }
    }
    // otherwise leave as-is to let schema produce the correct error
    return obj
  }

  // If amount provided instead of amountMinor, try to convert using currency
  if (obj.amount !== undefined && typeof obj.currency === "string") {
    try {
      const minor = majorToMinor(obj.amount as string | number, obj.currency as string)
      return { ...obj, amountMinor: minor }
    } catch (e) {
      return obj
    }
  }

  return obj
}, z.object({
  merchant: z.string().min(1).max(200),
  amountMinor: amountMinorSchema,
  currency: z
    .string()
    .transform((v) => normalizeCurrency(v))
    .refine((v) => /^[A-Z]{3}$/.test(v), "Invalid currency code"),
  date: z.string().datetime(),
  type: transactionTypeSchema.default("expense"),
  category: z.string().max(100).nullish(),
  subcategory: z.string().max(100).nullish(),
  source: z.string().min(1).max(100),
  account: z.string().max(200).nullish(),
  paymentMethod: z.string().max(100).nullish(),
  /** Client-supplied idempotency key. Unique per user. */
  externalId: z.string().min(1).max(200),
}))

export type TransactionInput = z.infer<typeof transactionInputSchema>

export const transactionInputArraySchema = z
  .array(transactionInputSchema)
  .min(1)
  .max(50)

export type TransactionInputArray = z.infer<typeof transactionInputArraySchema>
