import { HeaderSkeleton, TableCardSkeleton } from "@/components/shell/page-skeleton"

export default function ApiKeysLoading() {
  return (
    <div className="flex flex-col gap-8">
      <HeaderSkeleton withActions={false} />
      <TableCardSkeleton rows={4} titleWidth="w-24" />
    </div>
  )
}
