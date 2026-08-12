import { cn } from "@/lib/utils"

/**
 * Spendly wordmark — a single jade leaf folded into a wallet.
 * Uses currentColor so it inherits text color in light/dark.
 */
export function LogoMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Spendly logo"
      className={cn("size-7", className)}
      {...props}
    >
      <rect
        x="3"
        y="7"
        width="26"
        height="20"
        rx="6"
        className="fill-primary"
      />
      {/* wallet clasp cutout */}
      <rect
        x="20"
        y="15"
        width="9"
        height="4"
        rx="2"
        className="fill-background"
      />
      <circle cx="24" cy="17" r="1.2" className="fill-primary" />
      {/* leaf accent referencing the jade brand */}
      <path
        d="M9 13c0 3 1.8 4.5 4 4.5s4-1.5 4-4.5c0-1-1-2.5-4-2.5S9 12 9 13Z"
        className="fill-primary-foreground opacity-90"
      />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-base font-semibold tracking-tight">Spendly</span>
    </div>
  )
}
