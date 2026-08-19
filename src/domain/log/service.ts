import "server-only"
import type { ApplicationLog, NewApplicationLog } from "@/infrastructure/db/schema"
import {
  applicationLogQuerySchema,
  applicationLogRecordSchema,
  LOG_PAGE_SIZE,
  type ApplicationLogQuery,
} from "./schema"
import { insertMany, listByUser } from "./repository"

/*
  Application log service.

  - recordApplicationLogs: persistence path used by the database log sink.
    Events arrive already redacted by the logger. A malformed record is
    dropped individually so one bad event never sinks a batch. Database
    errors propagate to the caller (the sink), which is the fail-safe
    boundary that swallows them to the console.
  - listApplicationLogs: read path for the /logs UI. Always scoped by the
    authenticated user's id; callers must pass the session user id.
*/

export async function recordApplicationLogs(records: unknown[]): Promise<void> {
  const rows: NewApplicationLog[] = []
  for (const record of records) {
    const parsed = applicationLogRecordSchema.safeParse(record)
    if (!parsed.success) continue
    const r = parsed.data
    rows.push({
      userId: r.userId ?? null,
      requestId: r.requestId ?? null,
      transactionId: r.transactionId ?? null,
      level: r.level,
      event: r.event,
      message: r.message ?? null,
      metadata: r.metadata ?? null,
      createdAt: r.timestamp ? new Date(r.timestamp) : new Date(),
    })
  }
  if (rows.length > 0) await insertMany(rows)
}

export interface ApplicationLogPage {
  items: ApplicationLog[]
  page: number
  pageSize: number
  hasMore: boolean
  query: ApplicationLogQuery
}

export async function listApplicationLogs(
  userId: string,
  rawParams: Record<string, string | string[] | undefined>,
): Promise<ApplicationLogPage> {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string" && value !== "") flat[key] = value
  }
  // Invalid filter values are ignored rather than failing the page.
  const parsed = applicationLogQuerySchema.safeParse(flat)
  const query = parsed.success
    ? parsed.data
    : applicationLogQuerySchema.parse({})

  // Fetch one extra row to know whether another page exists.
  const rows = await listByUser(userId, {
    level: query.level,
    event: query.event,
    requestId: query.requestId,
    path: query.path,
    statusCode: query.statusCode,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    limit: LOG_PAGE_SIZE + 1,
    offset: (query.page - 1) * LOG_PAGE_SIZE,
  })

  return {
    items: rows.slice(0, LOG_PAGE_SIZE),
    page: query.page,
    pageSize: LOG_PAGE_SIZE,
    hasMore: rows.length > LOG_PAGE_SIZE,
    query,
  }
}
