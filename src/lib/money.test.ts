import { describe, it, expect } from "vitest"
import {
  formatMinorUnits,
  formatSignedMinorUnits,
  isValidMinorAmount,
  majorToMinorUnits,
  minorToMajor,
  minorUnitExponent,
  normalizeCurrency,
} from "./money"

describe("minorUnitExponent", () => {
  it("returns 2 for common currencies", () => {
    expect(minorUnitExponent("EUR")).toBe(2)
    expect(minorUnitExponent("USD")).toBe(2)
    expect(minorUnitExponent("GBP")).toBe(2)
  })
  it("returns 0 for zero-decimal currencies", () => {
    expect(minorUnitExponent("JPY")).toBe(0)
    expect(minorUnitExponent("KRW")).toBe(0)
    expect(minorUnitExponent("CLP")).toBe(0)
  })
  it("returns 3 for three-decimal currencies", () => {
    expect(minorUnitExponent("BHD")).toBe(3)
    expect(minorUnitExponent("KWD")).toBe(3)
    expect(minorUnitExponent("OMR")).toBe(3)
  })
  it("is case-insensitive", () => {
    expect(minorUnitExponent("eur")).toBe(2)
    expect(minorUnitExponent("Jpy")).toBe(0)
  })
})

describe("normalizeCurrency", () => {
  it("uppercases and trims", () => {
    expect(normalizeCurrency(" eur ")).toBe("EUR")
  })
  it("rejects non-3-letter codes", () => {
    expect(() => normalizeCurrency("EU")).toThrow()
    expect(() => normalizeCurrency("EURO")).toThrow()
    expect(() => normalizeCurrency("12")).toThrow()
  })
})

describe("minorToMajor", () => {
  it("converts cents to units for 2-decimal currencies", () => {
    expect(minorToMajor(1050, "EUR")).toBe(10.5)
    expect(minorToMajor(1050, "USD")).toBe(10.5)
  })
  it("returns the value unchanged for 0-decimal currencies", () => {
    expect(minorToMajor(100, "JPY")).toBe(100)
    expect(minorToMajor(12345, "KRW")).toBe(12345)
  })
  it("divides by 1000 for 3-decimal currencies", () => {
    expect(minorToMajor(10500, "BHD")).toBe(10.5)
  })
  it("preserves sign", () => {
    expect(minorToMajor(-1050, "EUR")).toBe(-10.5)
  })
})

describe("isValidMinorAmount", () => {
  it("accepts safe integers", () => {
    expect(isValidMinorAmount(0)).toBe(true)
    expect(isValidMinorAmount(1050)).toBe(true)
    expect(isValidMinorAmount(-1050)).toBe(true)
  })
  it("rejects non-integers and unsafe values", () => {
    expect(isValidMinorAmount(10.5)).toBe(false)
    expect(isValidMinorAmount("1050")).toBe(false)
    expect(isValidMinorAmount(NaN)).toBe(false)
    expect(isValidMinorAmount(Infinity)).toBe(false)
  })
})

describe("formatMinorUnits", () => {
  it("formats EUR cents as a currency string", () => {
    const out = formatMinorUnits(1050, "EUR", "en-US")
    expect(out).toContain("10.50")
  })
  it("formats USD cents", () => {
    const out = formatMinorUnits(2347, "USD", "en-US")
    expect(out).toContain("23.47")
  })
  it("formats JPY without decimals", () => {
    const out = formatMinorUnits(100, "JPY", "en-US")
    expect(out).toContain("100")
    expect(out).not.toContain("100.00")
  })
  it("formats BHD with 3 decimals", () => {
    const out = formatMinorUnits(10500, "BHD", "en-US")
    expect(out).toContain("10.500")
  })
  it("preserves negative amounts", () => {
    expect(formatMinorUnits(-1050, "EUR", "en-US")).toContain("10.50")
  })
})

describe("formatSignedMinorUnits", () => {
  it("prefixes negative amounts with a minus", () => {
    expect(formatSignedMinorUnits(-1050, "EUR", "en-US")).toMatch(/-/)
  })
  it("does not prefix positive amounts", () => {
    expect(formatSignedMinorUnits(1050, "EUR", "en-US")).not.toMatch(/^-/)
  })
})

describe("majorToMinorUnits", () => {
  it("converts major units to minor units for 2-decimal currencies", () => {
    expect(majorToMinorUnits("10.50", "EUR")).toBe(1050)
    expect(majorToMinorUnits(10.5, "EUR")).toBe(1050)
    expect(majorToMinorUnits("2400", "EUR")).toBe(240000)
    expect(majorToMinorUnits("0.01", "EUR")).toBe(1)
  })

  it("converts without decimals for 0-decimal currencies", () => {
    expect(majorToMinorUnits("1500", "JPY")).toBe(1500)
  })

  it("converts with three decimals for 3-decimal currencies", () => {
    expect(majorToMinorUnits("10.500", "BHD")).toBe(10500)
  })

  it("rejects values with too many decimal places", () => {
    expect(() => majorToMinorUnits("10.505", "EUR")).toThrow()
    expect(() => majorToMinorUnits("1.5", "JPY")).toThrow()
  })

  it("rejects invalid numeric formats", () => {
    expect(() => majorToMinorUnits("abc", "EUR")).toThrow()
    expect(() => majorToMinorUnits("", "EUR")).toThrow()
  })
})
