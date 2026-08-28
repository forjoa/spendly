"use server"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/infrastructure/auth/session"
import { recordManualTransaction } from "@/domain/transaction/service"

/*
  Server Action for one-off transactions entered by hand (manual income or
  expense). Runs server-side; auth via cookies. Input is validated again in
  the domain service (Zod); money is converted to integer minor units.
*/

export async function createManualTransactionAction(formData: FormData) {
  const { user } = await requireUser()
  const idempotencyKey = formData.get("idempotencyKey")
  const result = await recordManualTransaction(
    user.id,
    {
      merchant: formData.get("merchant"),
      amount: formData.get("amount"),
      currency: formData.get("currency"),
      date: formData.get("date"),
      type: formData.get("type"),
      category: formData.get("category") || null,
    },
    typeof idempotencyKey === "string" ? idempotencyKey : undefined,
  )
  revalidatePath("/transactions")
  revalidatePath("/income")
  revalidatePath("/overview")
  const failedDelivery = result.deliveries.find((d) => d.status === "failed")
  return {
    id: result.transaction.id,
    deliveryWarning: failedDelivery
      ? "Saved, but delivery to Notion failed. It will show as failed in Transactions."
      : null,
  }
}
