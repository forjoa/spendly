import { z } from "zod"
import { normalizeCurrency } from "@/lib/money"

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
 * The normalized transaction accepted by the Spendly API.
 * `amountMinor` is an integer in the currency's minor units (e.g. cents).
 */
export const transactionInputSchema = z.object({
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
})

export type TransactionInput = z.infer<typeof transactionInputSchema>

export const transactionInputArraySchema = z
  .array(transactionInputSchema)
  .min(1)
  .max(50)

export type TransactionInputArray = z.infer<typeof transactionInputArraySchema>
