import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Primary action(s), e.g. an "Add …" button. Wraps below the title on small screens. */
  actions?: ReactNode
}

/**
 * Standard page header: title + description on the left, primary action(s)
 * on the right. Used at the top of every page in the app shell so spacing,
 * type scale and wrapping behavior stay identical across the app.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
