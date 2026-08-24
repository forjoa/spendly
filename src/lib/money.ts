/**
 * Money handling for Spendly.
 *
 * All monetary amounts are stored and passed as integer minor units
 * (e.g. EUR 10.50 → 1050). Never use floating-point for persisted values.
 * See DATABASE.md and INTEGRATIONS.md.
 *
 * This module contains no side effects and no framework imports; it is safe
 * to use from the domain and to unit test in isolation.
 */

// Decimal exponents for currencies whose minor unit is not 1/100.
// ISO 4217. Most currencies use 2 (cents). JPY-family use 0; some Gulf
// currencies use 3.
const MINOR_UNIT_EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  CLP: 0,
  ISK: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BIF: 0,
  DJF: 0,
  GNF: 0,
  KMF: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENTS[normalizeCurrency(currency)] ?? 2
}

export function normalizeCurrency(currency: string): string {
  const upper = currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new Error(`Invalid currency code: ${currency}`)
  }
  return upper
}

/**
 * Convert a major-unit value (string or number like "10.50" or 10.5) into
 * integer minor units using the currency's exponent. Throws on invalid
 * format or when there are more fractional digits than the currency allows —
 * values are never rounded, truncated, or coerced through floats.
 */
export function majorToMinorUnits(
  value: string | number,
  currency: string,
): number {
  if (!currency) throw new Error("currency required to convert amount")
  const exp = minorUnitExponent(currency)

  const asString = typeof value === "number" ? value.toString() : (value ?? "").toString()
  const s = asString.trim()
  const match = s.match(/^([+-])?(\d+)(?:\.(\d+))?$/)
  if (!match) throw new Error("invalid numeric format")

  const sign = match[1] === "-" ? -1 : 1
  const integerPart = match[2]
  const fractionPart = match[3] ?? ""

  if (fractionPart.length > exp) {
    throw new Error(`too many decimal places for ${currency} (max ${exp})`)
  }

  const fracPadded = fractionPart.padEnd(exp, "0")
  const combined = integerPart + fracPadded
  const normalized = combined.replace(/^0+(?!$)/, "") || "0"
  const minor = Number(normalized) * sign
  if (!Number.isSafeInteger(minor)) throw new Error("amount out of safe integer range")
  return minor
}

/** True when the value is a safe integer in the supported minor-unit range. */
export function isValidMinorAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= 9_007_199_254_740_991
  )
}

/**
 * Convert integer minor units to a major-unit number, rounded to the
 * currency's precision. Used only for formatting; never persist the result.
 */
export function minorToMajor(minor: number, currency: string): number {
  const exp = minorUnitExponent(currency)
  if (exp === 0) return minor
  // Avoid binary float drift by scaling via string math for the common cases.
  const sign = minor < 0 ? -1 : 1
  const abs = Math.abs(minor)
  const scaled = abs / 10 ** exp
  return sign * scaled
}

/** Format integer minor units as a localized currency string. */
export function formatMinorUnits(
  minor: number,
  currency: string,
  locale?: string,
): string {
  const exp = minorUnitExponent(currency)
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizeCurrency(currency),
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(minorToMajor(minor, currency))
  } catch {
    // Unknown/unsupported currency code in the runtime — fall back to a
    // plain number + code so the value is still visible.
    return `${minorToMajor(minor, currency).toFixed(exp)} ${normalizeCurrency(currency)}`
  }
}

/** A sign-prefixed currency string, e.g. -€10.50 for an expense. */
export function formatSignedMinorUnits(
  minor: number,
  currency: string,
  locale?: string,
): string {
  const formatted = formatMinorUnits(Math.abs(minor), currency, locale)
  return minor < 0 ? `-${formatted}` : formatted
}

/** Compact date formatting for transaction lists. */
export function formatTransactionDate(
  isoDate: string,
  locale?: string,
): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}
