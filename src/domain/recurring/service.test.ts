import { describe, it, expect, beforeEach, vi } from "vitest"
import type { RecurringRule } from "@/infrastructure/db/schema"

/*
  Recurring rule service tests.

  createRule: a recurring rule has no client-supplied external id the way a
  transaction does, so a double form submission (double-click, a retried
  request after a slow response) has historically had no protection at all —
  it silently creates a second identical *active* rule, and every extra
  active rule materializes its own real transaction on every future
  occurrence, doubling that income/expense forever. createRule() now detects
  an exact-match active rule and returns it instead of inserting a
  duplicate.

  updateRule: editing a rule's schedule/start date used to recompute
  nextRunDate by stepping past whatever was already stored, so repeatedly
  editing a not-yet-materialized rule's start date drifted forward by a
  month on every save instead of landing on what was typed. Fixed by
  recomputing from the new start date when nothing has materialized yet,
  while still refusing to rewind before an occurrence that has.

  Only the DB boundary is mocked, following the pattern in
  api-key/service.test.ts. Real domain logic (Zod validation, the dedupe
  check, initialRunDate) runs for real.
*/

type RuleRow = RecurringRule

// Drizzle column `.name` (snake_case) → JS property name (camelCase).
const SNAKE_TO_CAMEL: Record<string, string> = {
  user_id: "userId",
  amount_minor: "amountMinor",
  day_of_month: "dayOfMonth",
  month_of_year: "monthOfYear",
  start_date: "startDate",
  next_run_date: "nextRunDate",
  created_at: "createdAt",
  updated_at: "updatedAt",
}

type Pred = { field: string; op: "eq" | "lte"; value?: unknown }

let store: RuleRow[]
let nextId: number

function evalPred(pred: unknown, row: RuleRow): boolean {
  if (typeof pred !== "object" || pred === null) return true
  if ("preds" in pred) {
    return (pred as { preds: unknown[] }).preds.every((p) => evalPred(p, row))
  }
  if ("field" in pred) {
    const p = pred as Pred
    const rowKey = SNAKE_TO_CAMEL[p.field] ?? p.field
    const val = row[rowKey as keyof RuleRow]
    if (p.op === "lte") return val !== null && (val as Date).getTime() <= (p.value as Date).getTime()
    return val === p.value
  }
  return true
}

function buildMockDb() {
  return {
    insert: () => ({
      values: (v: Partial<RuleRow>) => ({
        returning: () => {
          const row = {
            id: `rule-${nextId++}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...v,
          } as RuleRow
          store.push(row)
          return [row]
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: (pred: unknown) => {
          const matched = store.filter((row) => evalPred(pred, row))
          return {
            orderBy: () => matched,
            limit: (n: number) => matched.slice(0, n),
          }
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<RuleRow>) => ({
        where: (pred: unknown) => ({
          returning: () => {
            const matched = store.filter((row) => evalPred(pred, row))
            for (const row of matched) Object.assign(row, patch)
            return matched
          },
        }),
      }),
    }),
  }
}

vi.mock("drizzle-orm", () => ({
  eq: (field: { name: string }, value: unknown) => ({ field: field.name, op: "eq", value }) as Pred,
  and: (...preds: unknown[]) => ({ preds }),
  asc: () => ({}),
  lte: (field: { name: string }, value: unknown) => ({ field: field.name, op: "lte", value }) as Pred,
}))

vi.mock("@/infrastructure/db/client", async () => {
  const schema = await vi.importActual("@/infrastructure/db/schema")
  return { db: buildMockDb(), schema, getDB: () => buildMockDb() }
})

const { createRule, updateRule } = await import("./service")

const USER_A = "user-a"

const baseInput = {
  name: "Rent",
  amount: "1200.00",
  currency: "EUR",
  type: "expense" as const,
  frequency: "monthly" as const,
  startDate: "2026-08-01",
  dayOfMonth: 1,
  monthOfYear: null,
}

beforeEach(() => {
  store = []
  nextId = 1
})

describe("createRule", () => {
  it("creates a new rule on the first call", async () => {
    const rule = await createRule(USER_A, baseInput)
    expect(rule.name).toBe("Rent")
    expect(rule.amountMinor).toBe(120000)
    expect(store).toHaveLength(1)
  })

  it("a second identical submission does not create a duplicate active rule", async () => {
    const first = await createRule(USER_A, baseInput)
    const second = await createRule(USER_A, baseInput)

    expect(second.id).toBe(first.id)
    expect(store).toHaveLength(1)
  })

  it("a genuinely different rule (different amount) is still created", async () => {
    await createRule(USER_A, baseInput)
    const second = await createRule(USER_A, { ...baseInput, amount: "1300.00" })

    expect(store).toHaveLength(2)
    expect(second.amountMinor).toBe(130000)
  })

  it("does not dedupe against a paused (inactive) rule with the same schedule", async () => {
    const first = await createRule(USER_A, baseInput)
    first.active = false // simulate a paused rule directly in the store

    const second = await createRule(USER_A, baseInput)
    expect(second.id).not.toBe(first.id)
    expect(store).toHaveLength(2)
  })

  it("does not dedupe across different users", async () => {
    await createRule(USER_A, baseInput)
    const second = await createRule("user-b", baseInput)
    expect(store).toHaveLength(2)
    expect(second.userId).toBe("user-b")
  })
})

describe("updateRule", () => {
  it("reproduces and fixes the reported bug: editing a not-yet-materialized rule's start date back and forth lands exactly where typed, never drifting forward", async () => {
    const rule = await createRule(USER_A, { ...baseInput, startDate: "2026-09-01" })
    expect(rule.nextRunDate.toISOString()).toBe("2026-09-01T00:00:00.000Z")

    // Previously: nextOccurrence(spec, existing.nextRunDate) stepped one
    // period past whatever was already stored, so this landed on Oct 1.
    const toAug = await updateRule(USER_A, rule.id, { ...baseInput, startDate: "2026-08-01" })
    expect(toAug.nextRunDate.toISOString()).toBe("2026-08-01T00:00:00.000Z")

    // Previously: this then landed on Nov 1 — one period past Oct 1.
    const backToSep = await updateRule(USER_A, rule.id, { ...baseInput, startDate: "2026-09-01" })
    expect(backToSep.nextRunDate.toISOString()).toBe("2026-09-01T00:00:00.000Z")

    // And it must stay stable under further repetition, not keep creeping.
    const again = await updateRule(USER_A, rule.id, { ...baseInput, startDate: "2026-09-01" })
    expect(again.nextRunDate.toISOString()).toBe("2026-09-01T00:00:00.000Z")
  })

  it("editing only the amount leaves the schedule untouched", async () => {
    const rule = await createRule(USER_A, baseInput)
    const updated = await updateRule(USER_A, rule.id, { ...baseInput, amount: "1500.00" })
    expect(updated.amountMinor).toBe(150000)
    expect(updated.nextRunDate.getTime()).toBe(rule.nextRunDate.getTime())
  })

  it("does not rewind before an occurrence that has already materialized", async () => {
    const rule = await createRule(USER_A, { ...baseInput, startDate: "2026-01-01" })
    // Simulate materializeDueRules having already generated Jan 1 and
    // advanced the rule to Feb 1 — a real transaction now exists for Jan 1.
    const stored = store.find((r) => r.id === rule.id)!
    stored.nextRunDate = new Date("2026-02-01T00:00:00.000Z")

    // Now move the recurrence day from 1 to 15 without touching startDate.
    const updated = await updateRule(USER_A, rule.id, { ...baseInput, startDate: "2026-01-01", dayOfMonth: 15 })

    // Must not go back to Jan 15 (which is before the already-materialized
    // Feb 1) — that would insert a second, duplicate January occurrence.
    expect(updated.nextRunDate.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-02-01T00:00:00.000Z").getTime(),
    )
    expect(updated.nextRunDate.toISOString()).toBe("2026-02-15T00:00:00.000Z")
  })
})
