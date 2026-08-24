import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * A native <select> styled to match the Input component. Prefer this over a
 * custom dropdown for simple option lists: keyboard, mobile and accessibility
 * behaviour come for free.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Select }
