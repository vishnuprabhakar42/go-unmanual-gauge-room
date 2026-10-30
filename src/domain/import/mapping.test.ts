import { describe, expect, it } from "vitest";
import { detectHeaderRow, normalizeHeader, suggestMapping } from "./mapping";

describe("header mapping", () => {
  it("normalises headers", () => {
    expect(normalizeHeader("  Last Cal. Date (DD/MM/YY) ")).toBe("last cal date");
    expect(normalizeHeader("Sr. No.")).toBe("sr no");
  });

  it("maps a messy real-world header row", () => {
    const headers = [
      "Sr. No.",
      "Gauge ID",
      "Instrument Name",
      "Make",
      "M/C Sr No",
      "Range",
      "L.C.",
      "Dept.",
      "Location",
      "Cal Freq",
      "Last Cal Date",
      "Next Due",
      "Remarks",
    ];
    const { mapping } = suggestMapping(headers);
    expect(mapping.code).toBe(1);
    expect(mapping.type).toBe(2);
    expect(mapping.make).toBe(3);
    expect(mapping.range).toBe(5);
    expect(mapping.leastCount).toBe(6);
    expect(mapping.department).toBe(7);
    expect(mapping.location).toBe(8);
    expect(mapping.frequency).toBe(9);
    expect(mapping.lastCalibratedAt).toBe(10);
    expect(mapping.nextDueAt).toBe(11);
    expect(mapping.notes).toBe(12);
    // each column used once
    expect(new Set(Object.values(mapping)).size).toBe(Object.values(mapping).length);
  });

  it("ignores unrelated columns", () => {
    const { mapping } = suggestMapping(["Foo", "Bar baz", "Instrument Code"]);
    expect(mapping).toEqual({ code: 2 });
  });

  it("finds the header row below title rows", () => {
    const rows = [
      ["DEMO AUTO — GAUGE MASTER LIST", "", ""],
      ["", "", ""],
      ["Instrument Code", "Type", "Due Date"],
      ["VC-1", "Vernier", "01-01-2026"],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
  });
});
