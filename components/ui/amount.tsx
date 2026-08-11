import { cn } from "@/lib/utils"
import { formatMinorUnits } from "@/lib/money"

interface AmountProps {
  /** Integer amount in the currency's minor units (e.g. cents). */
  minor: number
  currency: string
  className?: string
  /** Show an explicit leading minus for expenses. */
  signed?: boolean
}

/**
 * Renders a monetary value using tabular mono figures so columns align.
 * Amounts are always integer minor units — never floats — per DATABASE.md.
 */
export function Amount({
  minor,
  currency,
  className,
  signed = false,
}: AmountProps) {
  const formatted = formatMinorUnits(minor, currency)
  return (
    <span className={cn("font-mono tabular-nums tracking-tight", className)}>
      {signed && minor > 0 ? "-" : ""}
      {formatted}
    </span>
  )
}
