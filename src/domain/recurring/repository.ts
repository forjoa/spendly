import "server-only"
import { and, asc, eq, lte } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import type {
  NewRecurringRule,
  RecurringRule,
} from "@/infrastructure/db/schema"

/*
  Recurring rule repository — data access for recurring income/expense rules.

  All queries are scoped by userId. Rules are deactivated, never
  hard-deleted, so generated transactions keep their meaning.
*/

export async function insert(rule: NewRecurringRule): Promise<RecurringRule> {
  const [row] = await db.insert(schema.recurringRules).values(rule).returning()
  if (!row) throw new Error("Recurring rule insert returned no rows")
  return row
}

export async function listByUser(userId: string): Promise<RecurringRule[]> {
  return db
    .select()
    .from(schema.recurringRules)
    .where(eq(schema.recurringRules.userId, userId))
    .orderBy(asc(schema.recurringRules.active), asc(schema.recurringRules.nextRunDate))
}

export async function getById(
  userId: string,
  id: string,
): Promise<RecurringRule | undefined> {
  const [row] = await db
    .select()
    .from(schema.recurringRules)
    .where(
      and(eq(schema.recurringRules.userId, userId), eq(schema.recurringRules.id, id)),
    )
    .limit(1)
  return row
}

/** Active rules whose next occurrence is due at or before `now`. */
export async function listDue(userId: string, now: Date): Promise<RecurringRule[]> {
  return db
    .select()
    .from(schema.recurringRules)
    .where(
      and(
        eq(schema.recurringRules.userId, userId),
        eq(schema.recurringRules.active, true),
        lte(schema.recurringRules.nextRunDate, now),
      ),
    )
    .orderBy(asc(schema.recurringRules.nextRunDate))
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewRecurringRule>,
): Promise<RecurringRule | undefined> {
  const [row] = await db
    .update(schema.recurringRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(schema.recurringRules.userId, userId), eq(schema.recurringRules.id, id)),
    )
    .returning()
  return row
}

export async function setNextRunDate(
  id: string,
  nextRunDate: Date,
): Promise<void> {
  await db
    .update(schema.recurringRules)
    .set({ nextRunDate, updatedAt: new Date() })
    .where(eq(schema.recurringRules.id, id))
}
