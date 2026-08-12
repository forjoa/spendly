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
 * The normalized transaction accepted by the Spendly API.
 * `amountMinor` is an integer in the currency's minor units (e.g. cents).
 */
export const transactionInputSchema = z.object({
  merchant: z.string().min(1).max(200),
  amountMinor: z.number().int().finite(),
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
