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
