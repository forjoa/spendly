import type { Metadata } from "next"
import { requireUser } from "@/infrastructure/auth/session"
import { listApplicationLogs } from "@/domain/log/service"
import { PageHeader } from "@/components/shell/page-header"
import { LogExplorer, type LogExplorerItem, type LogExplorerFilters } from "./log-explorer"

export const metadata: Metadata = { title: "Logs" }

/*
  /logs — per-user application log explorer.

  Reads are scoped by the authenticated session's user id inside
  listApplicationLogs; a user can never see another user's logs. Events
  emitted before authentication (userId null) are only visible in Axiom.
*/

interface LogsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pick(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key]
  return typeof value === "string" && value !== "" ? value : undefined
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const { user } = await requireUser()
  const params = await searchParams
  const result = await listApplicationLogs(user.id, params)

  const items: LogExplorerItem[] = result.items.map((row) => {
    const metadata = (row.metadata as Record<string, unknown> | null) ?? null
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      level: row.level,
      event: row.event,
      message: row.message,
      requestId: row.requestId,
      transactionId: row.transactionId,
      // Request attributes recorded in metadata by the API wrapper.
      method: typeof metadata?.method === "string" ? metadata.method : null,
      path: typeof metadata?.path === "string" ? metadata.path : null,
      statusCode:
        typeof metadata?.statusCode === "number" ? metadata.statusCode : null,
      durationMs:
        typeof metadata?.durationMs === "number" ? metadata.durationMs : null,
      metadata,
    }
  })

  const filters: LogExplorerFilters = {
    level: pick(params, "level") ?? "",
    event: pick(params, "event") ?? "",
    requestId: pick(params, "requestId") ?? "",
    path: pick(params, "path") ?? "",
    statusCode: pick(params, "statusCode") ?? "",
    from: pick(params, "from") ?? "",
    to: pick(params, "to") ?? "",
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Logs"
        description="Application events from your ingestion pipeline, newest first. Correlate an operation with its request id."
      />
      <LogExplorer
        items={items}
        filters={filters}
        page={result.page}
        hasMore={result.hasMore}
      />
    </div>
  )
}
