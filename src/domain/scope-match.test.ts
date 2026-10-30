import { describe, expect, it } from "vitest";
import { coveringVendorIds, scopeCovers } from "./scope-match";

describe("scope match", () => {
  const scope = { vendorId: "v1", parameter: "Length", rangeMin: 0, rangeMax: 300, unit: "mm" };
  it("matches parameter, unit and range", () => {
    expect(scopeCovers(scope, { parameter: "length", rangeMin: 0, rangeMax: 150, unit: "mm" })).toBe(true);
    expect(scopeCovers(scope, { parameter: "Length", rangeMin: 0, rangeMax: 600, unit: "mm" })).toBe(false);
    expect(scopeCovers(scope, { parameter: "Length", rangeMin: 0, rangeMax: 150, unit: "bar" })).toBe(false);
    expect(scopeCovers(scope, { parameter: "Pressure", rangeMin: 0, rangeMax: 10, unit: "mm" })).toBe(false);
  });
  it("is lenient where data is missing", () => {
    expect(scopeCovers(scope, { parameter: "Length", rangeMin: null, rangeMax: null, unit: null })).toBe(true);
    expect(
      scopeCovers(
        { ...scope, parameter: "Temperature", unit: "°C", rangeMin: -50, rangeMax: 1200 },
        { parameter: "temperature", rangeMin: 0, rangeMax: 300, unit: "degC" },
      ),
    ).toBe(true);
    expect(scopeCovers(scope, { parameter: null, rangeMin: 0, rangeMax: 10, unit: "mm" })).toBe(false);
  });
  it("lists covering vendors", () => {
    const ids = coveringVendorIds([scope, { ...scope, vendorId: "v2", rangeMax: 100 }], {
      parameter: "Length",
      rangeMin: 0,
      rangeMax: 150,
      unit: "mm",
    });
    expect([...ids]).toEqual(["v1"]);
  });
});
