import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  showWordmark?: boolean
}

/**
 * Spendly mark: a payment (the dot) flowing along a rail into a rounded
 * destination. Built from primitive shapes only — no decorative filler.
 */
export function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="relative inline-flex size-7 items-center justify-center rounded-[0.55rem] bg-primary text-primary-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M6 12h9"
            stroke="currentColor"
            strokeWidth="2.25"
            opacity="0.55"
          />
          <path d="M13 8l4 4-4 4" stroke="currentColor" strokeWidth="2.25" />
          <circle cx="6" cy="12" r="2.1" fill="currentColor" />
        </svg>
      </span>
      {showWordmark ? (
        <span className="text-[1.05rem] font-semibold tracking-tight text-foreground">
          Spendly
        </span>
      ) : null}
    </span>
  )
}
