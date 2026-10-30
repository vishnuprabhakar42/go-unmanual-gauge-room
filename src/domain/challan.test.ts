import { describe, expect, it } from "vitest";
import {
  VEHICLE_NO_REGEX,
  canCancelChallan,
  challanCopies,
  challanStatusFromReturns,
  expectedReturn,
  normalizeVehicleNo,
  totalValue,
} from "./challan";

describe("challan rules", () => {
  it("derives status from returns", () => {
    const d = new Date();
    expect(challanStatusFromReturns([{ returnedAt: null }, { returnedAt: null }])).toBe("ISSUED");
    expect(challanStatusFromReturns([{ returnedAt: d }, { returnedAt: null }])).toBe("PARTIALLY_RETURNED");
    expect(challanStatusFromReturns([{ returnedAt: d }, { returnedAt: d }])).toBe("RETURNED");
  });
  it("can be cancelled only before dispatch", () => {
    expect(canCancelChallan({ status: "DRAFT", dispatchedAt: null })).toBe(true);
    expect(canCancelChallan({ status: "ISSUED", dispatchedAt: null })).toBe(true);
    expect(canCancelChallan({ status: "ISSUED", dispatchedAt: new Date() })).toBe(false);
    expect(canCancelChallan({ status: "PARTIALLY_RETURNED", dispatchedAt: new Date() })).toBe(false);
  });
  it("computes expected return and copies", () => {
    const sent = new Date("2026-10-23T05:00:00Z");
    expect(expectedReturn(sent, [5, 10, 7]).toISOString()).toBe("2026-11-05T05:00:00.000Z");
    expect(challanCopies(3)).toEqual(["ORIGINAL FOR CONSIGNEE", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR CONSIGNOR"]);
    expect(challanCopies(1)).toEqual(["ORIGINAL FOR CONSIGNEE"]);
    expect(challanCopies(9)).toHaveLength(3);
  });
  it("totals values in paise-safe arithmetic and validates vehicle numbers", () => {
    expect(totalValue([{ value: 0.1 }, { value: 0.2 }, { value: 12500 }])).toBe(12500.3);
    expect(normalizeVehicleNo("mh 12-ab 1234")).toBe("MH12AB1234");
    expect(VEHICLE_NO_REGEX.test("MH12AB1234")).toBe(true);
    expect(VEHICLE_NO_REGEX.test("12AB")).toBe(false);
  });
});
