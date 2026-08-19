import "server-only"
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import type { ApplicationLog, NewApplicationLog } from "@/infrastructure/db/schema"

/*
  Application log repository — data access for the application_log table.

  Every read is scoped by userId: a user can never see another user's logs.
  Writes are append-only batches from the database log sink.
*/

export async function insertMany(rows: NewApplicationLog[]): Promise<void> {
  if (rows.length === 0) return
  await db.insert(schema.applicationLogs).values(rows)
}

export interface ListApplicationLogsFilter {
  level?: "info" | "warn" | "error"
  event?: string
  requestId?: string
  from?: Date
  to?: Date
  limit: number
  offset: number
}

export async function listByUser(
  userId: string,
  filter: ListApplicationLogsFilter,
): Promise<ApplicationLog[]> {
  const conditions: SQL[] = [eq(schema.applicationLogs.userId, userId)]
  if (filter.level) conditions.push(eq(schema.applicationLogs.level, filter.level))
  if (filter.event) conditions.push(eq(schema.applicationLogs.event, filter.event))
  if (filter.requestId) {
    conditions.push(eq(schema.applicationLogs.requestId, filter.requestId))
  }
  if (filter.from) conditions.push(gte(schema.applicationLogs.createdAt, filter.from))
  if (filter.to) conditions.push(lte(schema.applicationLogs.createdAt, filter.to))

  return db
    .select()
    .from(schema.applicationLogs)
    .where(and(...conditions))
    .orderBy(desc(schema.applicationLogs.createdAt), desc(schema.applicationLogs.id))
    .limit(filter.limit)
    .offset(filter.offset)
}
