import "server-only"
import { z } from "zod"
import { connectionRepo } from "./repository"
import { encryptCredential, type NotionCredential } from "./credentials"
import type { Connection } from "@/infrastructure/db/schema"
import { ValidationError } from "@/lib/errors"

/*
  Connection service — create/list/delete external connections for the
  authenticated user. For V0 only the Notion provider is supported.
*/

export const notionConnectionInputSchema = z.object({
  label: z.string().min(1).max(100),
  token: z.string().min(1).max(200),
  databaseId: z.string().min(1).max(100),
  apiVersion: z.string().max(20).optional(),
})

export type NotionConnectionInput = z.infer<typeof notionConnectionInputSchema>

export async function createNotionConnection(
  userId: string,
  input: NotionConnectionInput,
): Promise<Connection> {
  const parsed = notionConnectionInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError("Invalid Notion connection details")
  }
  const credential: NotionCredential = {
    token: parsed.data.token,
    databaseId: parsed.data.databaseId,
    apiVersion: parsed.data.apiVersion,
  }
  const encryptedCredential = await encryptCredential(credential)
  return connectionRepo.insert({
    userId,
    provider: "notion",
    label: parsed.data.label,
    encryptedCredential,
    enabled: true,
  })
}

export async function listConnections(userId: string): Promise<Connection[]> {
  return connectionRepo.listByUser(userId)
}

export async function deleteConnection(
  userId: string,
  id: string,
): Promise<void> {
  await connectionRepo.remove(userId, id)
}
