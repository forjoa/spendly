"use server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/infrastructure/auth/session"
import * as apiKeyService from "@/domain/api-key/service"
import { ValidationError } from "@/lib/errors"

/*
  Server Actions for API key management. Run server-side; auth via cookies.
*/

const createInputSchema = z.object({
  label: z.string().min(1).max(100),
})

export async function createApiKeyAction(formData: FormData) {
  const { user } = await requireUser()
  const parsed = createInputSchema.safeParse({
    label: formData.get("label"),
  })
  if (!parsed.success) {
    throw new ValidationError("Label must be 1 to 100 characters")
  }
  const created = await apiKeyService.createKey(user.id, parsed.data.label)
  revalidatePath("/api-keys")
  return {
    rawKey: created.rawKey,
    id: created.record.id,
    label: created.record.label,
    keySuffix: created.record.keySuffix,
  }
}

export async function revokeApiKeyAction(formData: FormData) {
  const { user } = await requireUser()
  const id = formData.get("id")
  if (typeof id !== "string" || !id) {
    throw new ValidationError("Missing key id")
  }
  await apiKeyService.revokeKey(user.id, id)
  revalidatePath("/api-keys")
}
