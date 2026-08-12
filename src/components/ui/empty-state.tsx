import * as React from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-6 text-center md:p-10",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-6">
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1.5 text-center">
        <p className="text-base font-medium tracking-tight text-balance">
          {title}
        </p>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
