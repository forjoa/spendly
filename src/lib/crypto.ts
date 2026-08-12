import "server-only"
import { webcrypto } from "node:crypto"
import { ConfigurationError } from "./errors"

/**
 * Server-only AES-256-GCM encryption for integration credentials.
 *
 * Used for the Notion internal integration token. The key comes from
 * SPENDLY_ENCRYPTION_KEY (base64, 32 bytes). A unique IV is generated per
 * value; the GCM auth tag is stored alongside the ciphertext.
 *
 * This module is never imported into client components (enforced by
 * `server-only`). Decrypted secrets are never returned to the client.
 */

const KEY_BYTES = 32
const IV_BYTES = 12
const ALGO = "AES-GCM" as const

type SubtleCrypto = typeof webcrypto.subtle
const subtle: SubtleCrypto = webcrypto.subtle as unknown as SubtleCrypto

function getKey(): Uint8Array {
  const raw = process.env.SPENDLY_ENCRYPTION_KEY
  if (!raw) {
    throw new ConfigurationError(
      "SPENDLY_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    )
  }
  let bytes: Uint8Array
  try {
    const buf = Buffer.from(raw, "base64")
    bytes = new Uint8Array(buf)
  } catch {
    throw new ConfigurationError("SPENDLY_ENCRYPTION_KEY is not valid base64")
  }
  if (bytes.byteLength !== KEY_BYTES) {
    throw new ConfigurationError(
      `SPENDLY_ENCRYPTION_KEY must be 32 bytes (base64), got ${bytes.byteLength} bytes`,
    )
  }
  return bytes
}

async function importKey(): Promise<CryptoKey> {
  return subtle.importKey("raw", getKey(), { name: ALGO }, false, [
    "encrypt",
    "decrypt",
  ])
}

export interface EncryptedValue {
  /** base64 ciphertext including the 12-byte IV prefix and 16-byte GCM tag. */
  ciphertext: string
}

/**
 * Encrypt a UTF-8 string. Returns a base64 string containing the IV
 * concatenated with the ciphertext+authTag.
 */
export async function encrypt(plaintext: string): Promise<EncryptedValue> {
  const key = await importKey()
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoded = new TextEncoder().encode(plaintext)
  const cipherbuf = await subtle.encrypt({ name: ALGO, iv }, key, encoded)
  const cipher = new Uint8Array(cipherbuf)
  const out = new Uint8Array(IV_BYTES + cipher.byteLength)
  out.set(iv, 0)
  out.set(cipher, IV_BYTES)
  return { ciphertext: Buffer.from(out).toString("base64") }
}

/** Decrypt a value produced by `encrypt`. Throws on tampering or wrong key. */
export async function decrypt(value: EncryptedValue): Promise<string> {
  const key = await importKey()
  const buf = Buffer.from(value.ciphertext, "base64")
  if (buf.byteLength < IV_BYTES + 16) {
    throw new ConfigurationError("Ciphertext is too short or corrupted")
  }
  const iv = new Uint8Array(buf.subarray(0, IV_BYTES))
  const cipher = new Uint8Array(buf.subarray(IV_BYTES))
  try {
    const plainbuf = await subtle.decrypt({ name: ALGO, iv }, key, cipher)
    return new TextDecoder().decode(plainbuf)
  } catch {
    throw new ConfigurationError("Decryption failed: wrong key or corrupted data")
  }
}

/** Test helper: generate a random 32-byte base64 key. Not for production use. */
export function generateTestKey(): string {
  return Buffer.from(webcrypto.getRandomValues(new Uint8Array(KEY_BYTES))).toString(
    "base64",
  )
}
