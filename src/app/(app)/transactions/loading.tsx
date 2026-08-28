import { HeaderSkeleton, CardBlockSkeleton, TableCardSkeleton } from "@/components/shell/page-skeleton"

export default function TransactionsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <HeaderSkeleton />
      <CardBlockSkeleton titleWidth="w-16" />
      <TableCardSkeleton rows={8} titleWidth="w-20" />
    </div>
  )
}
