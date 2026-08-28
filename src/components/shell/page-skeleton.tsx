import { Skeleton } from "@/components/ui/skeleton"

/*
  Shared building blocks for route `loading.tsx` files. Every authenticated
  page is a server component that awaits a database read, so Next.js shows
  these instantly on navigation while the real data streams in — the app
  never shows a blank page mid-navigation.

  Shapes intentionally mirror the real content (header, stat cards, tables)
  so the layout does not jump once data arrives.
*/

export function HeaderSkeleton({ withActions = true }: { withActions?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {withActions ? (
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
        </div>
      ) : null}
    </div>
  )
}

export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

export function CardBlockSkeleton({ titleWidth = "w-32" }: { titleWidth?: string }) {
  return (
    <div className="flex flex-col gap-6 rounded-xl border bg-card py-6 shadow-sm">
      <div className="px-6">
        <Skeleton className={`h-4 ${titleWidth}`} />
      </div>
      <div className="flex flex-col gap-3 px-6">
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

/** Skeleton for a card that wraps a data table (header row + N body rows). */
export function TableCardSkeleton({
  rows = 5,
  titleWidth = "w-28",
}: {
  rows?: number
  titleWidth?: string
}) {
  return (
    <div className="flex flex-col gap-6 rounded-xl border bg-card py-6 shadow-sm">
      <div className="px-6">
        <Skeleton className={`h-4 ${titleWidth}`} />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t px-6 py-3.5 first:border-t-0"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="ml-auto h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
