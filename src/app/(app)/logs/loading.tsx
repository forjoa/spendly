import { HeaderSkeleton, CardBlockSkeleton, TableCardSkeleton } from "@/components/shell/page-skeleton"

export default function LogsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <HeaderSkeleton withActions={false} />
      <CardBlockSkeleton titleWidth="w-24" />
      <TableCardSkeleton rows={8} titleWidth="w-16" />
    </div>
  )
}
