"use client"
import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { setRecurringRuleActiveAction } from "../recurring/actions"

/**
 * Pause/resume a recurring rule. Pausing keeps the rule and all generated
 * transactions; resuming skips ahead to the next future occurrence.
 */
export function RuleActiveButton({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = React.useTransition()

  function onClick() {
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("id", id)
        formData.set("active", String(!active))
        await setRecurringRuleActiveAction(formData)
        toast.success(active ? "Rule paused" : "Rule resumed")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update rule")
      }
    })
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Spinner /> : null}
      {active ? "Pause" : "Resume"}
    </Button>
  )
}
