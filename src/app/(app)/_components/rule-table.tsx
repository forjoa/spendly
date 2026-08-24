import type { RecurringRule } from "@/infrastructure/db/schema"
import { Amount } from "@/components/ui/amount"
import { Badge } from "@/components/ui/badge"
import { formatTransactionDate } from "@/lib/money"
import { describeSchedule } from "@/domain/recurring/recurrence"
import { RecurringRuleDialog } from "./recurring-rule-dialog"
import { RuleActiveButton } from "./rule-active-button"
import { toFormValues } from "./rule-form-values"

/*
  Shared table of recurring rules, used by the Recurring and Income pages.
  Server component: rows render read-only, actions are small client islands.
*/
export function RuleTable({ rules }: { rules: RecurringRule[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-6 py-2 font-medium">Name</th>
            <th className="px-6 py-2 font-medium text-right">Amount</th>
            <th className="px-6 py-2 font-medium">Schedule</th>
            <th className="px-6 py-2 font-medium">Next</th>
            <th className="px-6 py-2 font-medium">Status</th>
            <th className="px-6 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-b last:border-0">
              <td className="px-6 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{rule.name}</span>
                  {rule.category ? (
                    <span className="text-xs text-muted-foreground">{rule.category}</span>
                  ) : null}
                </div>
              </td>
              <td className="px-6 py-3 text-right">
                <Amount
                  minor={rule.type === "expense" ? -rule.amountMinor : rule.amountMinor}
                  currency={rule.currency}
                  signed
                  className="font-medium"
                />
              </td>
              <td className="px-6 py-3 text-muted-foreground">
                {describeSchedule(rule)}
              </td>
              <td className="px-6 py-3 text-muted-foreground">
                {rule.active
                  ? formatTransactionDate(rule.nextRunDate.toISOString())
                  : "—"}
              </td>
              <td className="px-6 py-3">
                <Badge variant={rule.active ? "success" : "muted"}>
                  {rule.active ? "Active" : "Paused"}
                </Badge>
              </td>
              <td className="px-6 py-3">
                <div className="flex items-center justify-end gap-1">
                  <RecurringRuleDialog
                    rule={toFormValues(rule)}
                    triggerLabel="Edit"
                    triggerVariant="ghost"
                  />
                  <RuleActiveButton id={rule.id} active={rule.active} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
