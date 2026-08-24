"use server"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/infrastructure/auth/session"
import {
  createRule,
  updateRule,
  setRuleActive,
} from "@/domain/recurring/service"
import { ValidationError } from "@/lib/errors"

/*
  Server Actions for recurring income/expense rules. Run server-side; auth
  via cookies. All input is validated again in the domain service (Zod).
*/

function parseIntOrNull(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function ruleInputFromForm(formData: FormData) {
  return {
    name: formData.get("name"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    type: formData.get("type"),
    category: formData.get("category") || null,
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    dayOfMonth: parseIntOrNull(formData.get("dayOfMonth")),
    monthOfYear: parseIntOrNull(formData.get("monthOfYear")),
  }
}

function revalidateFinancePages() {
  revalidatePath("/recurring")
  revalidatePath("/income")
  revalidatePath("/transactions")
  revalidatePath("/overview")
}

export async function createRecurringRuleAction(formData: FormData) {
  const { user } = await requireUser()
  await createRule(user.id, ruleInputFromForm(formData))
  revalidateFinancePages()
}

export async function updateRecurringRuleAction(formData: FormData) {
  const { user } = await requireUser()
  const id = formData.get("id")
  if (typeof id !== "string" || !id) {
    throw new ValidationError("Missing rule id")
  }
  await updateRule(user.id, id, ruleInputFromForm(formData))
  revalidateFinancePages()
}

export async function setRecurringRuleActiveAction(formData: FormData) {
  const { user } = await requireUser()
  const id = formData.get("id")
  const active = formData.get("active")
  if (typeof id !== "string" || !id) {
    throw new ValidationError("Missing rule id")
  }
  await setRuleActive(user.id, id, active === "true")
  revalidateFinancePages()
}
