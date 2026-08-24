import type { RecurringRule } from "@/infrastructure/db/schema"
import { minorToMajor, minorUnitExponent } from "@/lib/money"
import type { RecurringRuleFormValues } from "./recurring-rule-dialog"

/** Serialize a rule row into the plain shape the edit dialog expects. */
export function toFormValues(rule: RecurringRule): RecurringRuleFormValues {
  return {
    id: rule.id,
    name: rule.name,
    amount: minorToMajor(rule.amountMinor, rule.currency).toFixed(
      minorUnitExponent(rule.currency),
    ),
    currency: rule.currency,
    type: rule.type === "income" ? "income" : "expense",
    category: rule.category ?? "",
    frequency: rule.frequency,
    dayOfMonth: rule.dayOfMonth,
    monthOfYear: rule.monthOfYear,
    startDate: rule.startDate.toISOString().slice(0, 10),
  }
}
