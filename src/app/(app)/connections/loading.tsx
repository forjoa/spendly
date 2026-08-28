import { HeaderSkeleton, CardBlockSkeleton } from "@/components/shell/page-skeleton"

export default function ConnectionsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <HeaderSkeleton withActions={false} />
      <div className="flex flex-col gap-4">
        <CardBlockSkeleton titleWidth="w-40" />
        <CardBlockSkeleton titleWidth="w-40" />
      </div>
    </div>
  )
}
