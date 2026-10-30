import { describe, expect, it } from "vitest";
import {
  parseAdjustable,
  parseBoolean,
  parseCriticality,
  parseFrequency,
  parseNumber,
  parseRange,
  parseSource,
  parseTolerance,
} from "./values";

describe("import value parsers", () => {
  it("parses frequencies", () => {
    expect(parseFrequency("12")).toEqual({ value: 12, unit: "MONTHS" });
    expect(parseFrequency("6 M")).toEqual({ value: 6, unit: "MONTHS" });
    expect(parseFrequency("1 Year")).toEqual({ value: 12, unit: "MONTHS" });
    expect(parseFrequency("2 yrs")).toEqual({ value: 24, unit: "MONTHS" });
    expect(parseFrequency("180 days")).toEqual({ value: 180, unit: "DAYS" });
    expect(parseFrequency("Half Yearly")).toEqual({ value: 6, unit: "MONTHS" });
    expect(parseFrequency("Quarterly")).toEqual({ value: 3, unit: "MONTHS" });
    expect(parseFrequency("0")).toBeNull();
    expect(parseFrequency("often")).toBeNull();
  });

  it("parses ranges, numbers and tolerances", () => {
    expect(parseRange("0-150 mm")).toEqual({ min: 0, max: 150, unit: "mm" });
    expect(parseRange("0 – 25mm")).toEqual({ min: 0, max: 25, unit: "mm" });
    expect(parseRange("-50 to 200 °C")).toEqual({ min: -50, max: 200, unit: "°C" });
    expect(parseRange("M10x1.5")).toBeNull();
    expect(parseNumber("₹ 12,500.50")).toBe(12500.5);
    expect(parseNumber("0.01mm")).toBe(0.01);
    expect(parseNumber("")).toBeNull();
    expect(parseTolerance("±0.02 mm")).toBe(0.02);
    expect(parseTolerance("+/- 0.5")).toBe(0.5);
  });

  it("parses enums leniently", () => {
    expect(parseCriticality("high")).toBe("A");
    expect(parseCriticality("c")).toBe("C");
    expect(parseCriticality("?")).toBeNull();
    expect(parseSource("In-house")).toBe("INHOUSE");
    expect(parseSource("Outside")).toBe("EXTERNAL");
    expect(parseBoolean("Y")).toBe(true);
    expect(parseBoolean("no")).toBe(false);
  });
});

describe("parseAdjustable", () => {
  it("reads adjustable / non-adjustable wording", () => {
    expect(parseAdjustable("Adjustable")).toBe(true);
    expect(parseAdjustable("Non-Adjustable")).toBe(false);
    expect(parseAdjustable("non adjustable")).toBe(false);
    expect(parseAdjustable("N")).toBe(false);
    expect(parseAdjustable("maybe")).toBeNull();
    expect(parseAdjustable("")).toBeNull();
  });
});
