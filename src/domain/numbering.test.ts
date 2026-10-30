import { describe, expect, it } from "vitest";
import { DEFAULT_SERIES, assertWithinLimit, financialYear, formatDocNumber, validateSeriesTemplate } from "./numbering";

describe("financialYear (Apr–Mar, IST)", () => {
  it("rolls over on 1 April IST", () => {
    expect(financialYear(new Date("2026-03-31T18:00:00Z")).label).toBe("25-26"); // 23:30 IST 31 Mar
    expect(financialYear(new Date("2026-03-31T18:30:00Z")).label).toBe("26-27"); // 00:00 IST 1 Apr
    expect(financialYear(new Date("2026-10-22T00:00:00Z"))).toEqual({ startYear: 2026, label: "26-27", compact: "2627" });
    expect(financialYear(new Date("2027-02-01T00:00:00Z")).label).toBe("26-27");
  });

  it("handles century boundary", () => {
    expect(financialYear(new Date("2099-06-01T00:00:00Z")).label).toBe("99-00");
  });
});

describe("formatDocNumber", () => {
  const fy = financialYear(new Date("2026-10-22T00:00:00Z"));
  it("formats the default PO series", () => {
    expect(formatDocNumber({ ...DEFAULT_SERIES.PO, plantCode: "PLT1", fy, seq: 1 })).toBe("PO/PLT1/26-27/0001");
  });
  it("formats the default challan series within 16 chars", () => {
    const n = formatDocNumber({ ...DEFAULT_SERIES.DC, plantCode: "PLT1", fy, seq: 42 });
    expect(n).toBe("DCPLT1/2627/0042");
    expect(n.length).toBeLessThanOrEqual(16);
  });
  it("rejects unknown tokens", () => {
    expect(() => formatDocNumber({ template: "{FOO}{SEQ}", prefix: "X", plantCode: "P", fy, seq: 1, padding: 2 })).toThrow(
      /Unknown numbering token/,
    );
  });
});

describe("validateSeriesTemplate", () => {
  const fy = financialYear(new Date("2026-10-22T00:00:00Z"));
  it("accepts defaults for 4-char plant codes", () => {
    for (const docType of ["CR", "RFQ", "PO", "DC", "GP"] as const) {
      expect(validateSeriesTemplate(docType, DEFAULT_SERIES[docType], "PLT1", fy).ok).toBe(true);
    }
  });
  it("rejects a challan template that can exceed 16 chars", () => {
    const res = validateSeriesTemplate("DC", { prefix: "DC", template: "{PREFIX}/{PLANT}/{FY}/{SEQ}", padding: 4 }, "PLT1", fy);
    expect(res.ok).toBe(false);
  });
  it("requires {SEQ}", () => {
    expect(validateSeriesTemplate("PO", { prefix: "PO", template: "{PREFIX}", padding: 4 }, "P1", fy).ok).toBe(false);
  });
  it("assertWithinLimit guards issued challan numbers", () => {
    expect(() => assertWithinLimit("DC", "DCPLT1/2627/10000")).toThrow(/exceeds 16/);
    expect(() => assertWithinLimit("PO", "PO/PLANT1/26-27/100000")).not.toThrow();
  });
});
