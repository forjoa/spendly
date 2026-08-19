import { describe, it, expect } from "vitest"
import {
  transactionInputSchema,
  transactionInputArraySchema,
} from "./schema"

const validInput = {
  merchant: "Coffee Shop",
  amountMinor: 450,
  currency: "usd",
  date: "2025-01-15T10:30:00Z",
  source: "apple_wallet",
  externalId: "tx_001",
}

describe("transactionInputSchema", () => {
  it("accepts a valid transaction with defaults", () => {
    const result = transactionInputSchema.parse(validInput)
    expect(result.type).toBe("expense")
    expect(result.currency).toBe("USD")
    expect(result.category).toBeUndefined()
  })

  it("normalizes lowercase currency to uppercase", () => {
    const result = transactionInputSchema.parse({ ...validInput, currency: "eur" })
    expect(result.currency).toBe("EUR")
  })

  it("trims whitespace in currency", () => {
    const result = transactionInputSchema.parse({ ...validInput, currency: " gbp " })
    expect(result.currency).toBe("GBP")
  })

  it("rejects an invalid currency code", () => {
    expect(() => transactionInputSchema.parse({ ...validInput, currency: "US" })).toThrow()
  })

  it("rejects a non-integer amount", () => {
    const result = transactionInputSchema.safeParse({
      ...validInput,
      amountMinor: 4.5,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a non-finite amount (NaN)", () => {
    const result = transactionInputSchema.safeParse({
      ...validInput,
      amountMinor: NaN,
    })
    expect(result.success).toBe(false)
  })

  describe("amountMinor boundary contract (JSON number → exact integer)", () => {
    it.each([599, 1000, 99])(
      "accepts integer-valued number %i and yields an integer",
      (amount) => {
        const result = transactionInputSchema.parse({ ...validInput, amountMinor: amount })
        expect(result.amountMinor).toBe(amount)
        expect(Number.isSafeInteger(result.amountMinor)).toBe(true)
      },
    )

    it("treats the JSON text 599.0 as the integer 599", () => {
      // JSON has no int type: "599.0" and "599" parse to the same double.
      const body = JSON.parse(
        '{"merchant":"Coffee Shop","amountMinor":599.0,"currency":"EUR","date":"2025-01-15T10:30:00Z","source":"apple_wallet","externalId":"tx_float"}',
      )
      const result = transactionInputSchema.parse(body)
      expect(result.amountMinor).toBe(599)
      expect(Number.isSafeInteger(result.amountMinor)).toBe(true)
    })

    it.each([599.5, 99.99])(
      "rejects fractional number %s without rounding or truncating",
      (amount) => {
        const result = transactionInputSchema.safeParse({ ...validInput, amountMinor: amount })
        expect(result.success).toBe(false)
      },
    )

    it("rejects 5.99 (major units) instead of silently converting", () => {
      const result = transactionInputSchema.safeParse({ ...validInput, amountMinor: 5.99 })
      expect(result.success).toBe(false)
    })

    it("rejects a floating-point artifact such as 19.99 * 100", () => {
      // IEEE-754: 19.99 * 100 = 1998.9999999999998, not 1999. Never repaired.
      const artifact = 19.99 * 100
      expect(Number.isInteger(artifact)).toBe(false)
      const result = transactionInputSchema.safeParse({ ...validInput, amountMinor: artifact })
      expect(result.success).toBe(false)
    })

    it.each([NaN, Infinity, -Infinity])("rejects non-finite value %s", (amount) => {
      const result = transactionInputSchema.safeParse({ ...validInput, amountMinor: amount })
      expect(result.success).toBe(false)
    })

    it.each(["599", "99.99", "abc"])("rejects string %s", (amount) => {
      const result = transactionInputSchema.safeParse({ ...validInput, amountMinor: amount })
      expect(result.success).toBe(false)
    })

    it("rejects integers beyond the safe range (no silent precision loss)", () => {
      const result = transactionInputSchema.safeParse({
        ...validInput,
        amountMinor: 2 ** 53,
      })
      expect(result.success).toBe(false)
    })

    it("still accepts negative integers (domain permits signed amounts)", () => {
      const result = transactionInputSchema.parse({ ...validInput, amountMinor: -599 })
      expect(result.amountMinor).toBe(-599)
    })
  })

  it("rejects an empty merchant", () => {
    const result = transactionInputSchema.safeParse({ ...validInput, merchant: "" })
    expect(result.success).toBe(false)
  })

  it("rejects a merchant over 200 chars", () => {
    const result = transactionInputSchema.safeParse({
      ...validInput,
      merchant: "x".repeat(201),
    })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid date format", () => {
    const result = transactionInputSchema.safeParse({
      ...validInput,
      date: "2025-01-15",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty externalId", () => {
    const result = transactionInputSchema.safeParse({ ...validInput, externalId: "" })
    expect(result.success).toBe(false)
  })

  it("rejects an empty source", () => {
    const result = transactionInputSchema.safeParse({ ...validInput, source: "" })
    expect(result.success).toBe(false)
  })

  it("accepts all transaction types", () => {
    for (const type of ["expense", "income", "transfer", "refund"] as const) {
      const result = transactionInputSchema.safeParse({ ...validInput, type })
      expect(result.success).toBe(true)
    }
  })

  it("rejects an unknown transaction type", () => {
    const result = transactionInputSchema.safeParse({
      ...validInput,
      type: "payment",
    })
    expect(result.success).toBe(false)
  })

  it("accepts optional fields as null", () => {
    const result = transactionInputSchema.parse({
      ...validInput,
      category: null,
      subcategory: null,
      account: null,
      paymentMethod: null,
    })
    expect(result.category).toBeNull()
    expect(result.account).toBeNull()
  })

  it("accepts optional fields as strings", () => {
    const result = transactionInputSchema.parse({
      ...validInput,
      category: "Food",
      subcategory: "Coffee",
      account: "Checking",
      paymentMethod: "Card",
    })
    expect(result.category).toBe("Food")
    expect(result.paymentMethod).toBe("Card")
  })
})

describe("transactionInputArraySchema", () => {
  it("accepts an array of 1 to 50 transactions", () => {
    const result = transactionInputArraySchema.parse([validInput])
    expect(result).toHaveLength(1)
  })

  it("accepts exactly 50 transactions", () => {
    const arr = Array.from({ length: 50 }, (_, i) => ({
      ...validInput,
      externalId: `tx_${i}`,
    }))
    const result = transactionInputArraySchema.parse(arr)
    expect(result).toHaveLength(50)
  })

  it("rejects an empty array", () => {
    const result = transactionInputArraySchema.safeParse([])
    expect(result.success).toBe(false)
  })

  it("rejects an array of more than 50 transactions", () => {
    const arr = Array.from({ length: 51 }, (_, i) => ({
      ...validInput,
      externalId: `tx_${i}`,
    }))
    const result = transactionInputArraySchema.safeParse(arr)
    expect(result.success).toBe(false)
  })
})
