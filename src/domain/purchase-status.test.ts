import { describe, expect, it } from "vitest";
import { PO_TRANSITIONS, RFQ_TRANSITIONS, assertTransition, contractInForce, effectiveContractStatus } from "./purchase-status";

describe("purchase lifecycles", () => {
  it("PO: draft → approved → sent → acknowledged → closed", () => {
    expect(() => assertTransition(PO_TRANSITIONS, "DRAFT", "APPROVED", "PO")).not.toThrow();
    expect(() => assertTransition(PO_TRANSITIONS, "APPROVED", "SENT", "PO")).not.toThrow();
    expect(() => assertTransition(PO_TRANSITIONS, "SENT", "ACKNOWLEDGED", "PO")).not.toThrow();
    expect(() => assertTransition(PO_TRANSITIONS, "DRAFT", "SENT", "PO")).toThrow(/Cannot move PO from DRAFT to SENT/);
    expect(() => assertTransition(PO_TRANSITIONS, "SENT", "CANCELLED", "PO")).toThrow();
    expect(PO_TRANSITIONS.CLOSED).toEqual([]);
  });
  it("RFQ: awarded and cancelled are terminal", () => {
    expect(RFQ_TRANSITIONS.AWARDED).toEqual([]);
    expect(() => assertTransition(RFQ_TRANSITIONS, "OPEN", "AWARDED", "RFQ")).not.toThrow();
  });
  it("contracts are in force only when active and within dates", () => {
    const c = { status: "ACTIVE" as const, validFrom: new Date("2026-04-01"), validTo: new Date("2027-03-31") };
    expect(contractInForce(c, new Date("2026-10-23"))).toBe(true);
    expect(contractInForce(c, new Date("2027-04-02"))).toBe(false);
    expect(contractInForce({ ...c, status: "DRAFT" }, new Date("2026-10-23"))).toBe(false);
    expect(effectiveContractStatus(c, new Date("2027-04-02"))).toBe("EXPIRED");
  });
});
