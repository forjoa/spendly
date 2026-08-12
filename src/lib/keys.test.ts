import { describe, it, expect } from "vitest"
import {
  generateRawKey,
  hashKey,
  keySuffix,
  isRawKeyShape,
  KEY_PREFIX,
} from "./keys"

describe("keys", () => {
  describe("generateRawKey", () => {
    it("produces keys with the spendly prefix", () => {
      const key = generateRawKey()
      expect(key.startsWith(KEY_PREFIX)).toBe(true)
    })

    it("produces unique keys", () => {
      const a = generateRawKey()
      const b = generateRawKey()
      expect(a).not.toBe(b)
    })

    it("produces keys longer than the prefix plus a reasonable payload", () => {
      const key = generateRawKey()
      expect(key.length).toBeGreaterThan(KEY_PREFIX.length + 8)
    })
  })

  describe("hashKey", () => {
    it("returns a 64-character hex digest", async () => {
      const hash = await hashKey(generateRawKey())
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it("is deterministic for the same input", async () => {
      const key = generateRawKey()
      expect(await hashKey(key)).toBe(await hashKey(key))
    })

    it("differs for different inputs", async () => {
      expect(await hashKey(generateRawKey())).not.toBe(
        await hashKey(generateRawKey()),
      )
    })
  })

  describe("keySuffix", () => {
    it("returns the last 4 characters", () => {
      const key = "sk_live_abcdefghijklmnop"
      expect(keySuffix(key)).toBe("mnop")
    })
  })

  describe("isRawKeyShape", () => {
    it("accepts a well-formed key", () => {
      expect(isRawKeyShape(generateRawKey())).toBe(true)
    })

    it("rejects keys without the prefix", () => {
      expect(isRawKeyShape("live_abc1234567")).toBe(false)
    })

    it("rejects keys that are too short", () => {
      expect(isRawKeyShape("sk_live_abcd")).toBe(false)
    })

    it("rejects empty input", () => {
      expect(isRawKeyShape("")).toBe(false)
    })
  })
})
