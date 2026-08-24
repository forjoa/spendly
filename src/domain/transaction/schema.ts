import { z } from "zod"
import { normalizeCurrency, majorToMinorUnits } from "@/lib/money"

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
 * Decimal representations (599.5, "5.99") reach this schema only after the
 * preprocessing in {@link #transactionInputSchema} has converted them to
 * minor units via the currency exponent; anything that cannot be converted
 * exactly (e.g. 298.99999999999997, "abc") is left untouched and rejected
 * here — never rounded, truncated, or coerced. Silently "fixing" an amount
 * would corrupt money. This applies to every source, not just
 * Apple Shortcuts; source quirks stay at the boundary.
 */
export const amountMinorSchema = z
  .number({ error: "amountMinor must be a JSON number; strings are not accepted" })
  .int({ error: "amountMinor must be an integer in minor units; fractional values are rejected, never rounded" })
  .finite({ error: "amountMinor must be finite" })

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
        const minor = majorToMinorUnits(am as string | number, obj.currency as string)
        return { ...obj, amountMinor: minor }
      } catch {
        return obj
      }
    }
    // otherwise leave as-is to let schema produce the correct error
    return obj
  }

  // If amount provided instead of amountMinor, try to convert using currency
  if (obj.amount !== undefined && typeof obj.currency === "string") {
    try {
      const minor = majorToMinorUnits(obj.amount as string | number, obj.currency as string)
      return { ...obj, amountMinor: minor }
    } catch {
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

/**
 * A one-off transaction entered by hand in the app (source "manual").
 * Amount crosses the boundary as a major-unit string ("50" or "32.40") and
 * is converted to integer minor units — never rounded. Date is a calendar
 * day (YYYY-MM-DD); it is stored at midday UTC so it renders on the intended
 * day in every common time zone.
 */
export const manualTransactionInputSchema = z
  .object({
    merchant: z.string().trim().min(1, "Name is required").max(200),
    amount: z.string().min(1, "Amount is required").max(30),
    currency: z
      .string()
      .transform((v) => normalizeCurrency(v))
      .refine((v) => /^[A-Z]{3}$/.test(v), "Invalid currency code"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    type: z.enum(["income", "expense"]),
    category: z.string().trim().max(100).nullish(),
  })
  .superRefine((value, ctx) => {
    try {
      majorToMinorUnits(value.amount, value.currency)
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Amount is not a valid monetary value for this currency",
        path: ["amount"],
      })
    }
  })
  .transform((value) => ({
    merchant: value.merchant,
    amountMinor: Math.abs(majorToMinorUnits(value.amount, value.currency)),
    currency: value.currency,
    date: `${value.date}T12:00:00.000Z`,
    type: value.type,
    category: value.category || null,
  }))

export type ManualTransactionInput = z.infer<typeof manualTransactionInputSchema>
