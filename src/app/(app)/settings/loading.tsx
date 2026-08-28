import { HeaderSkeleton, CardBlockSkeleton } from "@/components/shell/page-skeleton"

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <HeaderSkeleton withActions={false} />
      <CardBlockSkeleton titleWidth="w-20" />
    </div>
  )
}
