import { describe, expect, it } from "vitest";
import { OOT_TRANSITIONS, assertOotTransition, dispositionBlockers, instrumentStatusAfter } from "./oot";

describe("OOT case", () => {
  it("moves open → assessing → dispositioned → closed only", () => {
    expect(() => assertOotTransition("OPEN", "ASSESSING")).not.toThrow();
    expect(() => assertOotTransition("ASSESSING", "DISPOSITIONED")).not.toThrow();
    expect(() => assertOotTransition("OPEN", "CLOSED")).toThrow();
    expect(OOT_TRANSITIONS.CLOSED).toEqual([]);
  });
  it("maps dispositions to instrument status", () => {
    expect(instrumentStatusAfter("SCRAPPED")).toBe("SCRAPPED");
    for (const d of ["ADJUSTED", "REPAIRED", "DOWNGRADED", "USE_AS_IS"] as const)
      expect(instrumentStatusAfter(d)).toBe("IN_STORE");
  });
  it("requires an impact assessment before a disposition", () => {
    expect(dispositionBlockers({ impactNotes: "", affectedProducts: null })).toHaveLength(2);
    expect(dispositionBlockers({ impactNotes: "Checked last 3 lots", affectedProducts: "None" })).toEqual([]);
  });
});
