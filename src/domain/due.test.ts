import { describe, expect, it } from "vitest";
import { formatDate } from "./india/format";
import {
  addInterval,
  computeNextDue,
  daysUntilDue,
  dueState,
  dueStateFromPlanning,
  dueStateRange,
  effectiveLeadDays,
  istMidnight,
  planningClauses,
} from "./due";

const d = (y: number, m: number, day: number) => istMidnight(y, m, day);

describe("due engine", () => {
  it("adds months with month-end clamping", () => {
    expect(formatDate(addInterval(d(2026, 1, 31), 1, "MONTHS"))).toBe("28-02-2026");
    expect(formatDate(addInterval(d(2028, 1, 31), 1, "MONTHS"))).toBe("29-02-2028");
    expect(formatDate(addInterval(d(2026, 3, 15), 12, "MONTHS"))).toBe("15-03-2027");
    expect(formatDate(addInterval(d(2026, 11, 30), 3, "MONTHS"))).toBe("28-02-2027");
  });

  it("adds days in IST calendar days", () => {
    expect(formatDate(addInterval(d(2026, 12, 25), 10, "DAYS"))).toBe("04-01-2027");
    // 23:00 IST on 1 Jan is still 1 Jan
    expect(formatDate(addInterval(new Date("2026-01-01T17:30:00Z"), 1, "DAYS"))).toBe("02-01-2026");
  });

  it("computes next due from last calibration", () => {
    expect(computeNextDue(null, 12, "MONTHS")).toBeNull();
    expect(formatDate(computeNextDue(d(2025, 10, 22), 12, "MONTHS")!)).toBe("22-10-2026");
    expect(() => addInterval(d(2026, 1, 1), 0, "DAYS")).toThrow();
  });

  it("classifies due state with an inclusive lead window", () => {
    const now = new Date("2026-10-22T06:00:00Z");
    expect(dueState(null, 30, now)).toBe("NOT_SCHEDULED");
    expect(dueState(d(2026, 10, 21), 30, now)).toBe("OVERDUE");
    expect(dueState(d(2026, 10, 22), 30, now)).toBe("DUE_SOON");
    expect(dueState(d(2026, 11, 21), 30, now)).toBe("DUE_SOON");
    expect(dueState(d(2026, 11, 22), 30, now)).toBe("OK");
    expect(daysUntilDue(d(2026, 10, 25), now)).toBe(3);
  });

  it("prefers the type lead time over the org default", () => {
    expect(effectiveLeadDays(15, 30)).toBe(15);
    expect(effectiveLeadDays(null, 30)).toBe(30);
  });

  it("builds query ranges consistent with dueState", () => {
    const now = new Date("2026-10-22T06:00:00Z");
    const soon = dueStateRange("DUE_SOON", 30, now);
    expect(soon.gte!.getTime()).toBe(d(2026, 10, 22).getTime());
    expect(soon.lt!.getTime()).toBe(d(2026, 11, 22).getTime());
    expect(dueStateRange("OVERDUE", 30, now).lt!.getTime()).toBe(d(2026, 10, 22).getTime());
  });
});

describe("planning date rule", () => {
  const ist = (s: string) => new Date(`${s}T00:00:00+05:30`);
  const now = new Date("2026-10-23T15:00:00+05:30");
  it("due soon from the planning date, overdue after the due date", () => {
    expect(dueStateFromPlanning(ist("2026-11-10"), ist("2026-10-23"), now)).toBe("DUE_SOON"); // planning today
    expect(dueStateFromPlanning(ist("2026-11-10"), ist("2026-10-24"), now)).toBe("OK");
    expect(dueStateFromPlanning(ist("2026-10-23"), ist("2026-10-01"), now)).toBe("DUE_SOON"); // due today
    expect(dueStateFromPlanning(ist("2026-10-22"), ist("2026-10-01"), now)).toBe("OVERDUE");
    expect(dueStateFromPlanning(null, null, now)).toBe("NOT_SCHEDULED");
    expect(planningClauses("ACTION", now)).toEqual({ planningDate: { lt: ist("2026-10-24") } });
    expect(planningClauses("DUE_SOON", now)).toEqual({
      nextDueAt: { gte: ist("2026-10-23") },
      planningDate: { lt: ist("2026-10-24") },
    });
    expect(planningClauses("OK", now)).toEqual({ planningDate: { gte: ist("2026-10-24") } });
  });
});
