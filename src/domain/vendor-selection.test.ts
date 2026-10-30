import { describe, expect, it } from "vitest";
import { selectVendor, type ContractRate } from "./vendor-selection";

const now = new Date("2026-10-23T06:00:00Z");
const base: ContractRate = {
  vendorId: "v1",
  vendorName: "Alpha Labs",
  rateContractItemId: "r1",
  rate: 500,
  tatDays: 7,
  contractStatus: "ACTIVE",
  contractPlantId: null,
  validFrom: new Date("2026-04-01"),
  validTo: new Date("2027-03-31"),
  vendorApproved: true,
  accreditationType: "NABL",
  nablValidUntil: new Date("2027-06-30"),
};
const inst = { plantId: "p1", nablRequired: true };

describe("selectVendor", () => {
  it("picks the cheapest, then the shortest TAT", () => {
    const res = selectVendor(
      [
        base,
        { ...base, vendorId: "v2", vendorName: "Beta", rateContractItemId: "r2", rate: 450, tatDays: 10 },
        { ...base, vendorId: "v3", vendorName: "Gamma", rateContractItemId: "r3", rate: 450, tatDays: 5 },
      ],
      inst,
      now,
    );
    expect(res.sourcing === "CONTRACT" && res.choice.vendorId).toBe("v3");
    expect(res.sourcing === "CONTRACT" && res.alternatives.map((a) => a.vendorId)).toEqual(["v2", "v1"]);
  });

  it("skips ineligible contracts", () => {
    const cheapButBad: ContractRate[] = [
      { ...base, vendorId: "draft", rate: 1, contractStatus: "DRAFT" },
      { ...base, vendorId: "expired", rate: 2, validTo: new Date("2026-09-30") },
      { ...base, vendorId: "otherplant", rate: 3, contractPlantId: "p2" },
      { ...base, vendorId: "unapproved", rate: 4, vendorApproved: false },
      { ...base, vendorId: "oem", rate: 5, accreditationType: "OEM" },
      { ...base, vendorId: "nablexpired", rate: 6, nablValidUntil: new Date("2026-10-01") },
    ];
    const res = selectVendor([...cheapButBad, base], inst, now);
    expect(res.sourcing === "CONTRACT" && res.choice.vendorId).toBe("v1");
    expect(selectVendor(cheapButBad, { plantId: "p1", nablRequired: false }, now)).toMatchObject({
      sourcing: "CONTRACT",
      choice: { vendorId: "oem" },
    });
  });

  it("falls back to RFQ with a reason", () => {
    expect(selectVendor([], inst, now)).toEqual({ sourcing: "RFQ", reason: "No rate contract for this instrument type" });
    expect(selectVendor([{ ...base, vendorApproved: false }], inst, now)).toMatchObject({
      sourcing: "RFQ",
      reason: expect.stringContaining("vendor not approved"),
    });
  });
});
