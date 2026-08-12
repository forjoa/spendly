"use server"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/infrastructure/auth/session"
import {
  createNotionConnection,
  deleteConnection,
} from "@/domain/connection/service"
import { ValidationError } from "@/lib/errors"

/*
  Server Actions for connection management. Run server-side; auth via cookies.
*/

export async function createNotionConnectionAction(formData: FormData) {
  const { user } = await requireUser()
  const label = formData.get("label")
  const token = formData.get("token")
  const databaseId = formData.get("databaseId")

  if (typeof label !== "string" || !label.trim()) {
    throw new ValidationError("Label is required")
  }
  if (typeof token !== "string" || !token.trim()) {
    throw new ValidationError("Notion integration token is required")
  }
  if (typeof databaseId !== "string" || !databaseId.trim()) {
    throw new ValidationError("Notion database id is required")
  }

  await createNotionConnection(user.id, {
    label: label.trim(),
    token: token.trim(),
    databaseId: databaseId.trim(),
  })
  revalidatePath("/connections")
}

export async function deleteConnectionAction(formData: FormData) {
  const { user } = await requireUser()
  const id = formData.get("id")
  if (typeof id !== "string" || !id) {
    throw new ValidationError("Missing connection id")
  }
  await deleteConnection(user.id, id)
  revalidatePath("/connections")
  revalidatePath("/overview")
}
