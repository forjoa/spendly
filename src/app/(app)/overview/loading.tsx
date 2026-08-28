import {
  HeaderSkeleton,
  StatCardsSkeleton,
  CardBlockSkeleton,
  TableCardSkeleton,
} from "@/components/shell/page-skeleton"

export default function OverviewLoading() {
  return (
    <div className="flex flex-col gap-8">
      <HeaderSkeleton />
      <StatCardsSkeleton count={3} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardBlockSkeleton titleWidth="w-36" />
        <CardBlockSkeleton titleWidth="w-40" />
      </div>
      <TableCardSkeleton rows={5} titleWidth="w-40" />
    </div>
  )
}
