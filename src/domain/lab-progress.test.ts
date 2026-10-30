import { describe, expect, it } from "vitest";
import { nextLabSteps, validateLabUpdate } from "./lab-progress";

describe("lab progress", () => {
  it("offers steps in order", () => {
    expect(nextLabSteps("DISPATCHED", null)).toEqual(["RECEIVED_AT_LAB"]);
    expect(nextLabSteps("AT_LAB", "RECEIVED_AT_LAB")).toEqual(["IN_PROGRESS", "DISPATCHED_BACK"]);
    expect(nextLabSteps("AT_LAB", "IN_PROGRESS")).toEqual(["DISPATCHED_BACK"]);
    expect(nextLabSteps("AT_LAB", "DISPATCHED_BACK")).toEqual([]);
    expect(nextLabSteps("RETURNED", "DISPATCHED_BACK")).toEqual([]);
  });
  it("requires AWB or a note to dispatch back", () => {
    expect(validateLabUpdate("AT_LAB", "IN_PROGRESS", { to: "DISPATCHED_BACK" })).toMatch(/AWB/);
    expect(validateLabUpdate("AT_LAB", "IN_PROGRESS", { to: "DISPATCHED_BACK", returnAwb: "BD123" })).toBeNull();
    expect(validateLabUpdate("AT_LAB", null, { to: "DISPATCHED_BACK", returnNote: "Hand delivered" })).toBeNull();
    expect(validateLabUpdate("PO_RAISED", null, { to: "RECEIVED_AT_LAB" })).toMatch(/Can't/);
  });
});
