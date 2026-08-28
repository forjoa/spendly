import "server-only"
import { ValidationError } from "@/lib/errors"
import { log } from "@/lib/logger"
import type { RecurringRule } from "@/infrastructure/db/schema"
import * as repo from "./repository"
import * as txRepo from "@/domain/transaction/repository"
import {
  initialRunDate,
  nextOccurrence,
  occurrenceKey,
  type RecurrenceSpec,
} from "./recurrence"
import { recurringRuleInputSchema } from "./schema"

/*
  Recurring rule service.

  Rules describe scheduled income/expenses (salary, rent, subscriptions).
  Materialization is lazy: callers invoke materializeDueRules() on reads
  (Overview, Transactions, Income, Recurring pages) and every due occurrence
  becomes a real transaction. Occurrences are idempotent — the externalId
  "recurring:{ruleId}:{occurrenceDate}" plus the unique (userId, externalId)
  index guarantees each occurrence is counted exactly once, so the Overview
  never double-counts a rule and its generated transaction.
*/

/** Safety cap so a misconfigured rule cannot loop forever in one request. */
const MAX_CATCH_UP_OCCURRENCES = 60

export const RECURRING_SOURCE = "recurring"

function specOf(rule: RecurringRule): RecurrenceSpec {
  return {
    frequency: rule.frequency,
    dayOfMonth: rule.dayOfMonth,
    monthOfYear: rule.monthOfYear,
  }
}

/**
 * True when `existing` describes the exact same schedule as the given
 * input — same amount, currency, type, cadence and start date. Used to
 * guard rule creation against accidental duplicates.
 */
function isDuplicateOf(
  existing: RecurringRule,
  input: {
    name: string
    amountMinor: number
    currency: string
    type: "income" | "expense"
    category: string | null
    frequency: RecurringRule["frequency"]
    dayOfMonth: number | null
    monthOfYear: number | null
    startDate: Date
  },
): boolean {
  return (
    existing.active &&
    existing.name === input.name &&
    existing.amountMinor === input.amountMinor &&
    existing.currency === input.currency &&
    existing.type === input.type &&
    existing.category === input.category &&
    existing.frequency === input.frequency &&
    existing.dayOfMonth === input.dayOfMonth &&
    existing.monthOfYear === input.monthOfYear &&
    existing.startDate.getTime() === input.startDate.getTime()
  )
}

export async function createRule(
  userId: string,
  rawInput: unknown,
): Promise<RecurringRule> {
  const parsed = recurringRuleInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid recurring rule",
    )
  }
  const input = parsed.data
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`)
  const category = input.category ?? null

  // Idempotency guard. Unlike transactions, a recurring rule has no
  // client-supplied external id to dedupe on, and a double form submission
  // (double-click, a retried request after a slow response) here is far
  // more costly than a duplicate transaction: every extra identical active
  // rule materializes its own real transaction on every future occurrence,
  // silently doubling that income/expense forever. Treat an exact-match
  // active rule as the same submission and return it instead of a new one.
  const existingRules = await repo.listByUser(userId)
  const duplicate = existingRules.find((r) =>
    isDuplicateOf(r, {
      name: input.name,
      amountMinor: input.amountMinor,
      currency: input.currency,
      type: input.type,
      category,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth,
      monthOfYear: input.monthOfYear,
      startDate,
    }),
  )
  if (duplicate) return duplicate

  return repo.insert({
    userId,
    name: input.name,
    amountMinor: input.amountMinor,
    currency: input.currency,
    type: input.type,
    category,
    frequency: input.frequency,
    dayOfMonth: input.dayOfMonth,
    monthOfYear: input.monthOfYear,
    startDate,
    nextRunDate: initialRunDate(startDate),
    active: true,
  })
}

export async function updateRule(
  userId: string,
  id: string,
  rawInput: unknown,
): Promise<RecurringRule> {
  const existing = await repo.getById(userId, id)
  if (!existing) throw new ValidationError("Recurring rule not found")

  const parsed = recurringRuleInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid recurring rule",
    )
  }
  const input = parsed.data
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`)

  // When the schedule or amount changes, future occurrences must follow the
  // new configuration. Recompute the next run from the last materialized
  // occurrence so already-generated history is untouched.
  const scheduleChanged =
    input.frequency !== existing.frequency ||
    input.dayOfMonth !== existing.dayOfMonth ||
    input.monthOfYear !== existing.monthOfYear ||
    startDate.getTime() !== existing.startDate.getTime()

  const nextRunDate = scheduleChanged
    ? nextOccurrence(
        { frequency: input.frequency, dayOfMonth: input.dayOfMonth, monthOfYear: input.monthOfYear },
        existing.nextRunDate,
      )
    : existing.nextRunDate

  const updated = await repo.update(userId, id, {
    name: input.name,
    amountMinor: input.amountMinor,
    currency: input.currency,
    type: input.type,
    category: input.category ?? null,
    frequency: input.frequency,
    dayOfMonth: input.dayOfMonth,
    monthOfYear: input.monthOfYear,
    startDate,
    nextRunDate,
  })
  if (!updated) throw new ValidationError("Recurring rule not found")
  return updated
}

/** Activate or deactivate a rule. Deactivation preserves all history. */
export async function setRuleActive(
  userId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const existing = await repo.getById(userId, id)
  if (!existing) throw new ValidationError("Recurring rule not found")
  // Reactivating after a pause must not backfill the paused period:
  // skip ahead to the first occurrence after today.
  let nextRunDate = existing.nextRunDate
  if (active && !existing.active) {
    const now = new Date()
    while (nextRunDate.getTime() <= now.getTime()) {
      nextRunDate = nextOccurrence(specOf(existing), nextRunDate)
    }
  }
  await repo.update(userId, id, { active, nextRunDate })
}

export async function listRules(userId: string): Promise<RecurringRule[]> {
  return repo.listByUser(userId)
}

export interface MaterializationResult {
  generated: number
}

/**
 * Insert one transaction per due occurrence of every active rule for the
 * user. Idempotent: a unique-conflict on (userId, externalId) means the
 * occurrence already exists, so the rule simply advances.
 */
export async function materializeDueRules(
  userId: string,
  now: Date = new Date(),
): Promise<MaterializationResult> {
  const dueRules = await repo.listDue(userId, now)
  let generated = 0

  for (const rule of dueRules) {
    const spec = specOf(rule)
    let nextRun = rule.nextRunDate
    let occurrences = 0

    while (nextRun.getTime() <= now.getTime() && occurrences < MAX_CATCH_UP_OCCURRENCES) {
      const externalId = `recurring:${rule.id}:${occurrenceKey(nextRun)}`
      try {
        await txRepo.insert({
          userId,
          merchant: rule.name,
          amountMinor: rule.amountMinor,
          currency: rule.currency,
          date: nextRun,
          type: rule.type,
          category: rule.category,
          subcategory: null,
          source: RECURRING_SOURCE,
          account: null,
          paymentMethod: null,
          externalId,
          recurringRuleId: rule.id,
        })
        generated += 1
        log.info("recurring.transaction.generated", {
          recurringRuleId: rule.id,
          occurrenceDate: occurrenceKey(nextRun),
          type: rule.type,
        })
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
        // Occurrence already materialized (replay) — advance without counting.
      }
      occurrences += 1
      nextRun = nextOccurrence(spec, nextRun)
    }

    if (nextRun.getTime() !== rule.nextRunDate.getTime()) {
      await repo.setNextRunDate(rule.id, nextRun)
    }
  }

  return { generated }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  )
}
