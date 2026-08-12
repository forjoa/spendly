import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { encrypt, decrypt, generateTestKey } from "./crypto"

const ORIGINAL_KEY = process.env.SPENDLY_ENCRYPTION_KEY

describe("crypto (AES-256-GCM)", () => {
  beforeEach(() => {
    process.env.SPENDLY_ENCRYPTION_KEY = generateTestKey()
  })
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.SPENDLY_ENCRYPTION_KEY
    else process.env.SPENDLY_ENCRYPTION_KEY = ORIGINAL_KEY
  })

  it("round-trips encrypt → decrypt", async () => {
    const plaintext = "secret_internal_integration_token_abc123"
    const enc = await encrypt(plaintext)
    expect(enc.ciphertext).not.toContain(plaintext)
    const dec = await decrypt(enc)
    expect(dec).toBe(plaintext)
  })

  it("produces a different ciphertext for the same plaintext (random IV)", async () => {
    const a = await encrypt("same")
    const b = await encrypt("same")
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it("fails when the key is missing", async () => {
    delete process.env.SPENDLY_ENCRYPTION_KEY
    await expect(encrypt("x")).rejects.toThrow(/SPENDLY_ENCRYPTION_KEY/)
  })

  it("fails when the key is the wrong length", async () => {
    process.env.SPENDLY_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64")
    await expect(encrypt("x")).rejects.toThrow(/32 bytes/)
  })

  it("fails when decrypting with the wrong key", async () => {
    const enc = await encrypt("secret")
    process.env.SPENDLY_ENCRYPTION_KEY = generateTestKey()
    await expect(decrypt(enc)).rejects.toThrow(/Decryption failed/)
  })

  it("fails on corrupted ciphertext", async () => {
    const enc = await encrypt("secret")
    const corrupted = { ciphertext: enc.ciphertext.slice(0, -4) + "AAAA" }
    await expect(decrypt(corrupted)).rejects.toThrow()
  })

  it("fails on too-short ciphertext", async () => {
    await expect(decrypt({ ciphertext: "AAAA" })).rejects.toThrow(/too short/)
  })
})
