import "server-only"
import { headers } from "next/headers"
import { eq, and, isNull } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import { AuthenticationError } from "@/lib/errors"
import { isRawKeyShape, hashKey } from "@/lib/keys"
import { log } from "@/lib/logger"

/*
  API-key authentication for public ingestion endpoints (iOS Shortcut).

  Keys are sent as `Authorization: Bearer sk_live_...`. We hash the presented
  key and look up the stored hash. Raw keys are never stored.

  Observability: emits auth.success / auth.failure events tied to the request
  id (inherited via the logger's AsyncLocalStorage). The API key, the
  Authorization header, and the stored hash are NEVER logged — only the
  boolean reason category (missing-header | bad-format | not-found).
*/

export interface AuthenticatedApiKey {
  userId: string
  keyId: string
}

export async function authenticateApiKey(): Promise<AuthenticatedApiKey> {
  const headerList = await headers()
  const auth = headerList.get("authorization") ?? ""
  const match = /^bearer\s+(.+)$/i.exec(auth)
  if (!match) {
    log.warn("transaction.auth.failure", { reason: "missing-header" })
    throw new AuthenticationError("Missing or malformed Authorization header")
  }
  const rawKey = match[1]!.trim()
  if (!isRawKeyShape(rawKey)) {
    log.warn("transaction.auth.failure", { reason: "bad-format" })
    throw new AuthenticationError("Invalid API key format")
  }

  const hash = await hashKey(rawKey)
  const [row] = await db
    .select()
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.keyHash, hash),
        isNull(schema.apiKeys.revokedAt),
      ),
    )
    .limit(1)

  if (!row) {
    log.warn("transaction.auth.failure", { reason: "not-found" })
    throw new AuthenticationError("API key not found or revoked")
  }

  log.info("transaction.auth.success", { userId: row.userId, keyId: row.id })

  // Best-effort: update lastUsedAt without blocking the response on failure.
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id))

  return { userId: row.userId, keyId: row.id }
}
