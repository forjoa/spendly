"use client"
import * as React from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  createRecurringRuleAction,
  updateRecurringRuleAction,
} from "../recurring/actions"

export interface RecurringRuleFormValues {
  id: string
  name: string
  /** Major units as a plain string, e.g. "2400.00". */
  amount: string
  currency: string
  type: "income" | "expense"
  category: string
  frequency: "weekly" | "monthly" | "yearly"
  dayOfMonth: number | null
  monthOfYear: number | null
  /** YYYY-MM-DD */
  startDate: string
}

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

interface RecurringRuleDialogProps {
  /** Fixes the type and hides the income/expense toggle. */
  fixedType?: "income" | "expense"
  /** When set, the dialog edits this rule instead of creating a new one. */
  rule?: RecurringRuleFormValues
  triggerLabel: string
  triggerVariant?: "default" | "outline" | "ghost"
}

export function RecurringRuleDialog({
  fixedType,
  rule,
  triggerLabel,
  triggerVariant = "default",
}: RecurringRuleDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [type, setType] = React.useState<"income" | "expense">(
    rule?.type ?? fixedType ?? "expense",
  )
  const [frequency, setFrequency] = React.useState(
    rule?.frequency ?? "monthly",
  )
  // Synchronous guard against a double-click racing ahead of the `pending`
  // re-render. This matters much more here than on a plain transaction: a
  // duplicate *rule* materializes its own real transaction on every future
  // occurrence, silently doubling that income/expense forever, not just
  // once (the domain service also rejects an exact-duplicate create as a
  // second line of defense — see recurring/service.ts).
  const submittingRef = React.useRef(false)

  function onSubmit(formData: FormData) {
    if (submittingRef.current) return
    submittingRef.current = true
    startTransition(async () => {
      try {
        if (rule) {
          formData.set("id", rule.id)
          await updateRecurringRuleAction(formData)
          toast.success("Recurring rule updated")
        } else {
          await createRecurringRuleAction(formData)
          toast.success("Recurring rule created")
        }
        setOpen(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save rule")
      } finally {
        submittingRef.current = false
      }
    })
  }

  const title = rule
    ? `Edit ${rule.name}`
    : fixedType === "income"
      ? "Add recurring income"
      : fixedType === "expense"
        ? "Add recurring expense"
        : "Add recurring"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerVariant === "ghost" ? "sm" : "default"}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {rule
              ? "Changes apply to future occurrences. Already generated transactions are kept."
              : "Spendly records this automatically on each scheduled date."}
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="flex flex-col gap-4">
          {!fixedType && (
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <div className="flex gap-4">
                {(["expense", "income"] as const).map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="type"
                      value={option}
                      checked={type === option}
                      onChange={() => setType(option)}
                      className="accent-primary"
                    />
                    {option === "expense" ? "Expense" : "Income"}
                  </label>
                ))}
              </div>
            </div>
          )}
          {fixedType && <input type="hidden" name="type" value={fixedType} />}

          <div className="flex flex-col gap-2">
            <Label htmlFor="rr-name">Name</Label>
            <Input
              id="rr-name"
              name="name"
              placeholder={type === "income" ? "Salary" : "Rent"}
              defaultValue={rule?.name}
              required
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rr-amount">Amount</Label>
              <Input
                id="rr-amount"
                name="amount"
                inputMode="decimal"
                placeholder="300.00"
                defaultValue={rule?.amount}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rr-currency">Currency</Label>
              <Select id="rr-currency" name="currency" defaultValue={rule?.currency ?? "EUR"}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rr-frequency">Frequency</Label>
              <Select
                id="rr-frequency"
                name="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as typeof frequency)}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rr-startDate">
                {rule ? "First occurrence" : "Starts on"}
              </Label>
              <Input
                id="rr-startDate"
                name="startDate"
                type="date"
                defaultValue={rule?.startDate ?? todayKey()}
                required
              />
            </div>
          </div>

          {frequency !== "weekly" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="rr-dayOfMonth">Day of month</Label>
                <Input
                  id="rr-dayOfMonth"
                  name="dayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  placeholder="25"
                  defaultValue={rule?.dayOfMonth ?? ""}
                  required
                />
              </div>
              {frequency === "yearly" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rr-monthOfYear">Month</Label>
                  <Select
                    id="rr-monthOfYear"
                    name="monthOfYear"
                    defaultValue={String(rule?.monthOfYear ?? 1)}
                  >
                    {MONTHS.map((label, i) => (
                      <option key={label} value={i + 1}>{label}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}
          {frequency === "weekly" && (
            <p className="text-xs text-muted-foreground">
              Repeats every 7 days from the start date.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="rr-category">Category (optional)</Label>
            <Input
              id="rr-category"
              name="category"
              placeholder={type === "income" ? "Salary" : "Housing"}
              defaultValue={rule?.category}
              maxLength={100}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {rule ? "Save changes" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
