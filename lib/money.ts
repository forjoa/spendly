/**
 * Money helpers. Amounts are stored and passed as integer minor units
 * (e.g. EUR cents) and never as floating-point values (see DATABASE.md).
 */

// Currencies whose minor unit is not 1/100 of the major unit.
const MINOR_UNIT_EXPONENTS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
}

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENTS[currency.toUpperCase()] ?? 2
}

/** Convert integer minor units to a major-unit number for formatting only. */
export function minorToMajor(minor: number, currency: string): number {
  const exp = minorUnitExponent(currency)
  return minor / 10 ** exp
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
      currency: currency.toUpperCase(),
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(minorToMajor(minor, currency))
  } catch {
    // Unknown currency code — fall back to a plain number + code.
    return `${minorToMajor(minor, currency).toFixed(exp)} ${currency.toUpperCase()}`
  }
}
