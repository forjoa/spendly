import { describe, it, expect } from "vitest"
import {
  nextOccurrence,
  initialRunDate,
  occurrenceKey,
  utcDay,
  describeSchedule,
} from "./recurrence"

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

describe("utcDay", () => {
  it("normalizes to UTC midnight", () => {
    expect(utcDay(new Date("2026-08-24T15:42:11.000Z")).toISOString()).toBe(
      "2026-08-24T00:00:00.000Z",
    )
  })
})

describe("occurrenceKey", () => {
  it("formats YYYY-MM-DD in UTC", () => {
    expect(occurrenceKey(d("2026-02-03"))).toBe("2026-02-03")
  })
})

describe("initialRunDate", () => {
  it("weekly: is the start date at UTC midnight — any weekday is a valid first occurrence", () => {
    const spec = { frequency: "weekly" as const }
    expect(
      initialRunDate(spec, new Date("2026-08-25T10:00:00.000Z")).toISOString(),
    ).toBe("2026-08-25T00:00:00.000Z")
  })

  it("monthly: uses the start date itself when it already lands on the configured day", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 4 }
    expect(initialRunDate(spec, d("2026-08-04")).toISOString()).toBe(
      "2026-08-04T00:00:00.000Z",
    )
  })

  it("monthly: rolls forward to next month when the start date is past the configured day — a rule meant to start next month must not pay out on the creation day", () => {
    // Reproduces the real bug: a "day 1" salary rule created on the 24th
    // must first fire on the 1st of the *following* month, never the 24th.
    const spec = { frequency: "monthly" as const, dayOfMonth: 1 }
    expect(initialRunDate(spec, d("2026-08-24")).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    )
  })

  it("monthly: rolls forward within the same month when the configured day is still ahead", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 25 }
    expect(initialRunDate(spec, d("2026-08-10")).toISOString()).toBe(
      "2026-08-25T00:00:00.000Z",
    )
  })

  it("monthly: clamps to the last day of a shorter month", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 31 }
    expect(initialRunDate(spec, d("2026-02-01")).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    )
  })

  it("yearly: uses the start date when it already matches month and day", () => {
    const spec = { frequency: "yearly" as const, monthOfYear: 4, dayOfMonth: 10 }
    expect(initialRunDate(spec, d("2026-04-10")).toISOString()).toBe(
      "2026-04-10T00:00:00.000Z",
    )
  })

  it("yearly: rolls forward to next year when the configured date has already passed this year", () => {
    const spec = { frequency: "yearly" as const, monthOfYear: 4, dayOfMonth: 10 }
    expect(initialRunDate(spec, d("2026-08-24")).toISOString()).toBe(
      "2027-04-10T00:00:00.000Z",
    )
  })
})

describe("nextOccurrence — weekly", () => {
  const spec = { frequency: "weekly" as const }

  it("advances exactly 7 days", () => {
    expect(nextOccurrence(spec, d("2026-08-24")).toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    )
  })

  it("crosses month boundaries", () => {
    expect(nextOccurrence(spec, d("2026-08-30")).toISOString()).toBe(
      "2026-09-06T00:00:00.000Z",
    )
  })
})

describe("nextOccurrence — monthly", () => {
  it("advances to the same day next month", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 25 }
    expect(nextOccurrence(spec, d("2026-08-25")).toISOString()).toBe(
      "2026-09-25T00:00:00.000Z",
    )
  })

  it("clamps the 31st to the last day of shorter months", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 31 }
    expect(nextOccurrence(spec, d("2026-01-31")).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    )
  })

  it("clamps to Feb 29 in leap years", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 31 }
    expect(nextOccurrence(spec, d("2024-01-31")).toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    )
  })

  it("resumes on the configured day after a clamped month", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 31 }
    // After the clamped Feb 28 occurrence, the next one is Mar 31.
    expect(nextOccurrence(spec, d("2026-02-28")).toISOString()).toBe(
      "2026-03-31T00:00:00.000Z",
    )
  })

  it("advances within the same month when the day is still ahead", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 25 }
    expect(nextOccurrence(spec, d("2026-08-10")).toISOString()).toBe(
      "2026-08-25T00:00:00.000Z",
    )
  })

  it("crosses the year boundary", () => {
    const spec = { frequency: "monthly" as const, dayOfMonth: 15 }
    expect(nextOccurrence(spec, d("2026-12-15")).toISOString()).toBe(
      "2027-01-15T00:00:00.000Z",
    )
  })

  it("rejects a missing dayOfMonth", () => {
    expect(() =>
      nextOccurrence({ frequency: "monthly" }, d("2026-08-10")),
    ).toThrow()
  })
})

describe("nextOccurrence — yearly", () => {
  const spec = { frequency: "yearly" as const, monthOfYear: 4, dayOfMonth: 10 }

  it("advances one year", () => {
    expect(nextOccurrence(spec, d("2026-04-10")).toISOString()).toBe(
      "2027-04-10T00:00:00.000Z",
    )
  })

  it("returns this year's date when still ahead", () => {
    expect(nextOccurrence(spec, d("2026-01-05")).toISOString()).toBe(
      "2026-04-10T00:00:00.000Z",
    )
  })

  it("clamps Feb 29 rules to Feb 28 in non-leap years", () => {
    const leapSpec = { frequency: "yearly" as const, monthOfYear: 2, dayOfMonth: 29 }
    expect(nextOccurrence(leapSpec, d("2024-02-29")).toISOString()).toBe(
      "2025-02-28T00:00:00.000Z",
    )
  })

  it("rejects incomplete configuration", () => {
    expect(() =>
      nextOccurrence({ frequency: "yearly", dayOfMonth: 10 }, d("2026-01-01")),
    ).toThrow()
  })
})

describe("describeSchedule", () => {
  it("describes each frequency", () => {
    expect(describeSchedule({ frequency: "weekly" })).toBe("Weekly")
    expect(
      describeSchedule({ frequency: "monthly", dayOfMonth: 25 }),
    ).toBe("Monthly · day 25")
    expect(
      describeSchedule({ frequency: "yearly", monthOfYear: 1, dayOfMonth: 5 }),
    ).toBe("Yearly · Jan 5")
  })
})
