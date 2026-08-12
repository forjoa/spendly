import "server-only"
import { webcrypto } from "node:crypto"

/*
  API key generation and hashing.

  Raw keys are shown to the user exactly once at creation time. We store only
  a SHA-256 hash (for lookup) and the last 4 characters (for display). Raw keys
  never touch the database.
*/

const RAW_BYTES = 32

/** Spendly API keys use a recognizable prefix so they are easy to spot in logs. */
export const KEY_PREFIX = "sk_live_"

/** Length of the random payload (before base64url encoding). */
export function generateRawKey(): string {
  const bytes = webcrypto.getRandomValues(new Uint8Array(RAW_BYTES))
  const payload = Buffer.from(bytes).toString("base64url")
  return `${KEY_PREFIX}${payload}`
}

/** SHA-256 hex digest of the raw key. Stored as `keyHash`. */
export async function hashKey(rawKey: string): Promise<string> {
  const digest = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawKey),
  )
  return Buffer.from(digest).toString("hex")
}

/** Last 4 characters of the raw key, for display in the UI. */
export function keySuffix(rawKey: string): string {
  return rawKey.slice(-4)
}

/**
 * Validate the shape of a raw key presented by a client.
 * Returns true for keys matching the Spendly prefix and a non-empty payload.
 */
export function isRawKeyShape(value: string): boolean {
  return (
    value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length + 4
  )
}
