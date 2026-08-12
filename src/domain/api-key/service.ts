import "server-only"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import { generateRawKey, hashKey, keySuffix } from "@/lib/keys"
import type { ApiKey } from "@/infrastructure/db/schema"

/*
  API key service — create, list, revoke for the authenticated user.

  Raw keys are returned exactly once at creation time. Only the SHA-256 hash
  and a 4-character display suffix are persisted.
*/

export interface CreatedApiKey {
  /** The raw key. Shown once; never retrievable again. */
  rawKey: string
  record: ApiKey
}

export async function createKey(
  userId: string,
  label: string,
): Promise<CreatedApiKey> {
  const rawKey = generateRawKey()
  const keyHash = await hashKey(rawKey)
  const [record] = await db
    .insert(schema.apiKeys)
    .values({
      userId,
      label: label.trim().slice(0, 100),
      keyHash,
      keySuffix: keySuffix(rawKey),
    })
    .returning()
  if (!record) throw new Error("API key insert returned no rows")
  return { rawKey, record }
}

export async function listKeys(userId: string): Promise<ApiKey[]> {
  return db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .orderBy(desc(schema.apiKeys.createdAt))
}

export async function listActiveKeys(userId: string): Promise<ApiKey[]> {
  return db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)))
    .orderBy(desc(schema.apiKeys.createdAt))
}

/**
 * Revoke a key. Scoped by userId so one user cannot revoke another's key.
 * Returns the revoked row or undefined if the key did not belong to the user.
 */
export async function revokeKey(
  userId: string,
  id: string,
): Promise<ApiKey | undefined> {
  const [row] = await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId)))
    .returning()
  return row
}
