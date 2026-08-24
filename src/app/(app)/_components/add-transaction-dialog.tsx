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
import { createManualTransactionAction } from "../transactions/actions"

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY"]

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

interface AddTransactionDialogProps {
  fixedType: "income" | "expense"
  triggerLabel: string
}

/** One-off manual transaction (e.g. cash expense, freelance payment). */
export function AddTransactionDialog({
  fixedType,
  triggerLabel,
}: AddTransactionDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const isIncome = fixedType === "income"

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await createManualTransactionAction(formData)
        if (result.deliveryWarning) {
          toast.warning(result.deliveryWarning)
        } else {
          toast.success(isIncome ? "Income added" : "Expense added")
        }
        setOpen(false)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not save transaction",
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isIncome ? "default" : "outline"}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isIncome ? "Add one-time income" : "Add expense"}</DialogTitle>
          <DialogDescription>
            {isIncome
              ? "A payment you received once — it will not repeat automatically."
              : "A one-off expense that did not come through Apple Wallet."}
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="type" value={fixedType} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-merchant">{isIncome ? "From" : "Merchant"}</Label>
            <Input
              id="mt-merchant"
              name="merchant"
              placeholder={isIncome ? "Freelance project" : "Cash payment"}
              required
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="mt-amount">Amount</Label>
              <Input
                id="mt-amount"
                name="amount"
                inputMode="decimal"
                placeholder="50.00"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mt-currency">Currency</Label>
              <Select id="mt-currency" name="currency" defaultValue="EUR">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="mt-date">Date</Label>
              <Input id="mt-date" name="date" type="date" defaultValue={todayKey()} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mt-category">Category (optional)</Label>
              <Input
                id="mt-category"
                name="category"
                placeholder={isIncome ? "Freelance" : "Groceries"}
                maxLength={100}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
