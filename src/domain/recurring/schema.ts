import { z } from "zod"
import { normalizeCurrency, majorToMinorUnits } from "@/lib/money"

/*
  Recurring rule input schemas (Zod).

  Amounts cross the boundary as major-unit strings ("2400" or "2400.50")
  from forms and are converted to integer minor units — never rounded.
*/

export const recurringTypeSchema = z.enum(["income", "expense"])
export const recurringFrequencySchema = z.enum(["weekly", "monthly", "yearly"])

const amountMajorSchema = z
  .string()
  .min(1, "Amount is required")
  .max(30)

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")

export const recurringRuleInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    /** Major units, e.g. "2400.00". Converted with the currency exponent. */
    amount: amountMajorSchema,
    currency: z
      .string()
      .transform((v) => normalizeCurrency(v))
      .refine((v) => /^[A-Z]{3}$/.test(v), "Invalid currency code"),
    type: recurringTypeSchema,
    category: z.string().trim().max(100).nullish(),
    frequency: recurringFrequencySchema,
    /** First occurrence, YYYY-MM-DD. */
    startDate: dateSchema,
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    monthOfYear: z.number().int().min(1).max(12).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.frequency !== "weekly" && !value.dayOfMonth) {
      ctx.addIssue({
        code: "custom",
        message: "Day of month is required for monthly and yearly rules",
        path: ["dayOfMonth"],
      })
    }
    if (value.frequency === "yearly" && !value.monthOfYear) {
      ctx.addIssue({
        code: "custom",
        message: "Month is required for yearly rules",
        path: ["monthOfYear"],
      })
    }
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
    ...value,
    amountMinor: Math.abs(majorToMinorUnits(value.amount, value.currency)),
    dayOfMonth: value.frequency === "weekly" ? null : (value.dayOfMonth ?? null),
    monthOfYear: value.frequency === "yearly" ? (value.monthOfYear ?? null) : null,
  }))

export type RecurringRuleInput = z.infer<typeof recurringRuleInputSchema>

/** Fields editable on an existing rule. Amount/schedule edits apply to future occurrences only. */
export const recurringRuleUpdateSchema = recurringRuleInputSchema

export type RecurringRuleUpdate = z.infer<typeof recurringRuleUpdateSchema>
