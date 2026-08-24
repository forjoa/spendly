/*
  Recurrence math for recurring income/expense rules.

  Pure functions over UTC calendar dates — no framework, no database, no
  clock access. The current time is always passed in, which keeps the logic
  deterministic and unit-testable.

  Semantics:
  - weekly:  every 7 days from the start date.
  - monthly: on `dayOfMonth` each month, clamped to the month's last day
             (a rule for the 31st runs on Feb 28/29).
  - yearly:  on `monthOfYear`/`dayOfMonth`, clamped the same way.

  Occurrences are UTC midnights so a rule never drifts across time zones.
*/

export type RecurringFrequency = "weekly" | "monthly" | "yearly"

export interface RecurrenceSpec {
  frequency: RecurringFrequency
  /** 1-31. Required for monthly and yearly rules. */
  dayOfMonth?: number | null
  /** 1-12. Required for yearly rules. */
  monthOfYear?: number | null
}

/** UTC midnight of the given date. */
export function utcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

/** Last day of the given UTC month (month is 0-based). */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function clampDay(year: number, monthIndex: number, day: number): number {
  return Math.min(day, daysInMonth(year, monthIndex))
}

/** Format a date as YYYY-MM-DD (UTC). Used in idempotency keys. */
export function occurrenceKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * The occurrence strictly after `after`. `after` is normally the previous
 * occurrence; the rule's own start date anchors the very first occurrence.
 */
export function nextOccurrence(spec: RecurrenceSpec, after: Date): Date {
  const day = utcDay(after)

  switch (spec.frequency) {
    case "weekly":
      return new Date(day.getTime() + 7 * 24 * 60 * 60 * 1000)

    case "monthly": {
      const dom = spec.dayOfMonth
      if (!dom || dom < 1 || dom > 31) {
        throw new Error("monthly rules require dayOfMonth (1-31)")
      }
      let year = day.getUTCFullYear()
      let month = day.getUTCMonth()
      let candidate = new Date(Date.UTC(year, month, clampDay(year, month, dom)))
      if (candidate.getTime() <= day.getTime()) {
        month += 1
        if (month > 11) {
          month = 0
          year += 1
        }
        candidate = new Date(Date.UTC(year, month, clampDay(year, month, dom)))
      }
      return candidate
    }

    case "yearly": {
      const dom = spec.dayOfMonth
      const moy = spec.monthOfYear
      if (!dom || dom < 1 || dom > 31 || !moy || moy < 1 || moy > 12) {
        throw new Error("yearly rules require monthOfYear (1-12) and dayOfMonth (1-31)")
      }
      const monthIndex = moy - 1
      let year = day.getUTCFullYear()
      let candidate = new Date(
        Date.UTC(year, monthIndex, clampDay(year, monthIndex, dom)),
      )
      if (candidate.getTime() <= day.getTime()) {
        year += 1
        candidate = new Date(
          Date.UTC(year, monthIndex, clampDay(year, monthIndex, dom)),
        )
      }
      return candidate
    }
  }
}

/**
 * The date a rule should run next given it has never run: its start date,
 * normalized to UTC midnight.
 */
export function initialRunDate(startDate: Date): Date {
  return utcDay(startDate)
}

/** Human-facing description of a schedule, e.g. "Monthly · day 25". */
export function describeSchedule(spec: RecurrenceSpec): string {
  switch (spec.frequency) {
    case "weekly":
      return "Weekly"
    case "monthly":
      return `Monthly · day ${spec.dayOfMonth}`
    case "yearly": {
      const month = new Date(Date.UTC(2000, (spec.monthOfYear ?? 1) - 1, 1))
        .toLocaleString("en", { month: "short", timeZone: "UTC" })
      return `Yearly · ${month} ${spec.dayOfMonth}`
    }
  }
}
