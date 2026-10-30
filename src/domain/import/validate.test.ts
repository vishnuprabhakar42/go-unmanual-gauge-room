import { describe, expect, it } from "vitest";
import { formatDate } from "../india/format";
import { istMidnight } from "../due";
import { scopedKey, validateRows, type ImportContext, type RawCell } from "./validate";
import type { ColumnMapping } from "./mapping";

const mapping: ColumnMapping = { code: 0, type: 1, frequency: 2, lastCalibratedAt: 3, department: 4, range: 5, nextDueAt: 6 };

function ctx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    defaultPlantCode: "PLT1",
    plantCodes: new Set(["PLT1", "PLT2"]),
    types: new Map([
      [
        "VERNIER CALIPER",
        { name: "Vernier Caliper", defaultFrequencyValue: 12, defaultFrequencyUnit: "MONTHS", nablRequired: true, unit: "mm" },
      ],
    ]),
    existingCodes: new Set(["VC-OLD"]),
    departments: new Set([scopedKey("PLT1", "Assembly")]),
    locations: new Set(),
    options: { createMissingTypes: false, updateExisting: false },
    now: new Date("2026-10-22T06:00:00Z"),
    ...overrides,
  };
}

const rows: RawCell[][] = [
  ["VC-001", "vernier caliper", "12 months", "15/03/2026", "Assembly", "0-150 mm", null],
  ["VC-002", "Vernier Caliper", "", "45731", "Machine Shop", "", null],
  ["", "Vernier Caliper", "12", "01-01-2026", "", "", null],
  ["VC-001", "Vernier Caliper", "12", "01-01-2026", "", "", null],
  ["VC-OLD", "Vernier Caliper", "12", "01-01-2026", "", "", null],
  ["MM-01", "Micrometer", "12", "01-01-2026", "", "", null],
  ["VC-003", "Vernier Caliper", "12", "31-02-2026", "", "", null],
  ["VC-004", "Vernier Caliper", "12", "", "", "", "10/12/2026"],
  ["", "", "", "", "", "", null],
];

describe("validateRows", () => {
  it("produces row-level errors and a summary", () => {
    const { results, summary } = validateRows(rows, mapping, ctx());
    expect(summary.total).toBe(8); // blank row skipped
    const byRow = new Map(results.map((r) => [r.row, r]));

    const first = byRow.get(2)!;
    expect(first.action).toBe("create");
    expect(first.data?.typeName).toBe("Vernier Caliper"); // canonical type name
    expect(first.data?.rangeMin).toBe(0);
    expect(first.data?.rangeMax).toBe(150);
    expect(first.data?.unit).toBe("mm");
    expect(formatDate(first.data!.nextDueAt)).toBe("15-03-2027");

    expect(formatDate(byRow.get(3)!.data!.lastCalibratedAt)).toBe("15-03-2025"); // Excel serial
    expect(byRow.get(4)!.errors[0].message).toMatch(/code is missing/);
    expect(byRow.get(5)!.errors[0].message).toMatch(/Duplicate code — also on row 2/);
    expect(byRow.get(6)!.errors[0].message).toMatch(/already exists/);
    expect(byRow.get(7)!.errors[0].message).toMatch(/Unknown type “Micrometer”/);
    expect(byRow.get(8)!.errors[0].field).toBe("lastCalibratedAt");
    expect(formatDate(byRow.get(9)!.data!.nextDueAt)).toBe("10-12-2026"); // only due date given
    expect(byRow.get(9)!.data!.lastCalibratedAt).toBeNull();

    expect(summary.errors).toBe(5);
    expect(summary.create).toBe(3);
    expect(summary.newDepartments).toEqual(["PLT1 · Machine Shop"]);
  });

  it("creates missing types and updates existing codes when asked", () => {
    const { results, summary } = validateRows(
      rows,
      mapping,
      ctx({ options: { createMissingTypes: true, updateExisting: true } }),
    );
    expect(results.find((r) => r.code === "VC-OLD")!.action).toBe("update");
    expect(results.find((r) => r.code === "MM-01")!.action).toBe("create");
    expect(summary.missingTypes).toEqual(["Micrometer"]);
  });

  it("rejects future calibration dates", () => {
    const { results } = validateRows([["X1", "Vernier Caliper", "12", "01-01-2027", "", "", null]], mapping, ctx());
    expect(results[0].errors[0].message).toMatch(/future/);
  });

  it("uses the type's default frequency when blank", () => {
    const { results } = validateRows([["X2", "Vernier Caliper", "", "22-10-2025", "", "", null]], mapping, ctx());
    expect(results[0].data!.nextDueAt!.getTime()).toBe(istMidnight(2026, 10, 22).getTime());
  });
});
