import type { Metadata } from "next"
import { Repeat } from "lucide-react"
import { requireUser } from "@/infrastructure/auth/session"
import { listRules, materializeDueRules } from "@/domain/recurring/service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { RecurringRuleDialog } from "../_components/recurring-rule-dialog"
import { RuleTable } from "../_components/rule-table"

export const metadata: Metadata = { title: "Recurring" }

/*
  /recurring — manage recurring income and expenses.

  Rules generate real transactions on their scheduled dates (lazy, idempotent
  materialization — see the recurring domain service). Pausing a rule stops
  future occurrences; the generated history is always preserved.
*/
export default async function RecurringPage() {
  const { user } = await requireUser()
  await materializeDueRules(user.id)
  const rules = await listRules(user.id)
  const incomeRules = rules.filter((r) => r.type === "income")
  const expenseRules = rules.filter((r) => r.type === "expense")

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
          <p className="text-sm text-muted-foreground">
            Money that arrives or leaves on a schedule. Spendly records each
            occurrence automatically — configure it once.
          </p>
        </div>
        <RecurringRuleDialog triggerLabel="Add recurring" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recurring income</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {incomeRules.length === 0 ? (
            <div className="px-6 py-4">
              <EmptyState
                icon={<Repeat />}
                title="No recurring income"
                description="Add your salary or any income that repeats on a schedule."
              />
            </div>
          ) : (
            <RuleTable rules={incomeRules} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recurring expenses</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {expenseRules.length === 0 ? (
            <div className="px-6 py-4">
              <EmptyState
                icon={<Repeat />}
                title="No recurring expenses"
                description="Add rent, subscriptions, loans or insurance that repeat on a schedule."
              />
            </div>
          ) : (
            <RuleTable rules={expenseRules} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
