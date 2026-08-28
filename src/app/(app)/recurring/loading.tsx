import { HeaderSkeleton, TableCardSkeleton } from "@/components/shell/page-skeleton"

export default function RecurringLoading() {
  return (
    <div className="flex flex-col gap-8">
      <HeaderSkeleton />
      <TableCardSkeleton rows={3} titleWidth="w-36" />
      <TableCardSkeleton rows={3} titleWidth="w-40" />
    </div>
  )
}
