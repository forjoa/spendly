import "server-only"
import { encrypt, decrypt } from "@/lib/crypto"

/*
  Encrypted credential payloads for connections.

  V0: the Notion connection stores a JSON object { token, databaseId } so the
  single `encryptedCredential` column can hold everything the adapter needs,
  without adding Notion-specific columns to the schema.
*/

export interface NotionCredential {
  token: string
  databaseId: string
  /** Optional API version override. */
  apiVersion?: string
}

export type ConnectionCredential = NotionCredential

export async function encryptCredential(
  credential: ConnectionCredential,
): Promise<string> {
  const { ciphertext } = await encrypt(JSON.stringify(credential))
  return ciphertext
}

export async function decryptCredential<T extends ConnectionCredential>(
  encrypted: string,
): Promise<T> {
  const plaintext = await decrypt({ ciphertext: encrypted })
  return JSON.parse(plaintext) as T
}
