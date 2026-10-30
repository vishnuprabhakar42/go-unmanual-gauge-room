import { describe, expect, it } from "vitest";
import { agingBucket, daysSince, dueClauses, istMidnight, monthKey, monthRange, upcomingMonths } from "./due";

const now = new Date("2026-10-23T06:00:00Z"); // 23-10-2026 IST
const day = (y: number, m: number, d: number) => istMidnight(y, m, d);

describe("dueClauses (per-type windows)", () => {
  it("uses one clause when no type overrides the org window", () => {
    expect(dueClauses("DUE_SOON", { orgDays: 30, typeLeads: [] }, now)).toEqual([
      { range: { gte: day(2026, 10, 23), lt: day(2026, 11, 23) } },
    ]);
  });

  it("groups types by lead time and excludes them from the default clause", () => {
    const clauses = dueClauses(
      "DUE_SOON",
      {
        orgDays: 30,
        typeLeads: [
          { typeId: "plug", lead: 15 },
          { typeId: "ring", lead: 15 },
          { typeId: "slip", lead: 45 },
          { typeId: "same", lead: 30 },
        ],
      },
      now,
    );
    expect(clauses).toHaveLength(3);
    expect(clauses[0]).toEqual({
      types: { notIn: ["plug", "ring", "slip"] },
      range: { gte: day(2026, 10, 23), lt: day(2026, 11, 23) },
    });
    expect(clauses[1]).toEqual({ types: { in: ["plug", "ring"] }, range: { gte: day(2026, 10, 23), lt: day(2026, 11, 8) } });
    expect(clauses[2]).toEqual({ types: { in: ["slip"] }, range: { gte: day(2026, 10, 23), lt: day(2026, 12, 8) } });
  });

  it("ACTION = overdue or inside the window (no lower bound)", () => {
    const [c] = dueClauses("ACTION", { orgDays: 30, typeLeads: [] }, now);
    expect(c.range).toEqual({ lt: day(2026, 11, 23) });
  });

  it("overdue ignores lead times", () => {
    expect(dueClauses("OVERDUE", { orgDays: 30, typeLeads: [{ typeId: "x", lead: 5 }] }, now)).toEqual([
      { range: { lt: day(2026, 10, 23) } },
    ]);
  });
});

describe("months and aging", () => {
  it("keys and ranges months in IST", () => {
    expect(monthKey(new Date("2026-10-31T19:00:00Z"))).toBe("2026-11"); // 1 Nov 00:30 IST
    expect(monthRange("2026-12")).toEqual({ gte: day(2026, 12, 1), lt: day(2027, 1, 1) });
    expect(upcomingMonths(4, now)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
  });

  it("buckets days at vendor", () => {
    expect([0, 15, 16, 30, 31].map(agingBucket)).toEqual(["0-15", "0-15", "16-30", "16-30", "30+"]);
    expect(daysSince(day(2026, 10, 3), now)).toBe(20);
  });
});
