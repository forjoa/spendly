import { HeaderSkeleton, TableCardSkeleton } from "@/components/shell/page-skeleton"

export default function IncomeLoading() {
  return (
    <div className="flex flex-col gap-8">
      <HeaderSkeleton />
      <TableCardSkeleton rows={3} titleWidth="w-36" />
      <TableCardSkeleton rows={5} titleWidth="w-32" />
    </div>
  )
}
