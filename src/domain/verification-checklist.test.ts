import { describe, expect, it } from "vitest";
import { checklistOutcome, evaluateChecklist, type ChecklistInput } from "./verification-checklist";

const base: ChecklistInput = {
  nablRequired: true,
  certificateNo: "PCL/26/1234",
  ulrNo: "CC245126000001234F",
  calibratedAt: new Date("2026-10-20T00:00:00Z"),
  sentAt: new Date("2026-10-15T00:00:00Z"),
  receivedAt: new Date("2026-10-22T00:00:00Z"),
  nablMarkPresent: true,
  labAccreditationNo: "cc 2451",
  vendorNablCertNo: "CC-2451",
  vendorIsNabl: true,
  withinScope: true,
  uncertaintyStated: true,
  readingsResult: "PASS",
  now: new Date("2026-10-23T00:00:00Z"),
};
const status = (i: ChecklistInput) => Object.fromEntries(evaluateChecklist(i).map((c) => [c.key, c.status]));

describe("verification checklist", () => {
  it("passes a complete NABL certificate (accreditation number compared loosely)", () => {
    expect(Object.values(status(base)).every((s) => s === "pass")).toBe(true);
    expect(checklistOutcome(evaluateChecklist(base))).toMatchObject({ canDecide: true, mustReject: false });
  });
  it("flags accreditation mismatches and impossible dates as certificate defects", () => {
    const items = evaluateChecklist({ ...base, labAccreditationNo: "CC-9999", calibratedAt: new Date("2026-10-01T00:00:00Z") });
    expect(Object.fromEntries(items.map((c) => [c.key, c.status]))).toMatchObject({
      accreditationMatches: "fail",
      calibrationDate: "fail",
    });
    expect(checklistOutcome(items)).toMatchObject({
      canDecide: false,
      mustReject: true,
      documentFailures: ["calibrationDate", "accreditationMatches"],
    });
  });
  it("treats out-of-tolerance results as a decision (OOT), not a defect", () => {
    expect(checklistOutcome(evaluateChecklist({ ...base, readingsResult: "FAIL" }))).toMatchObject({
      canDecide: true,
      mustReject: false,
    });
  });
  it("skips NABL items when not required and waits for missing answers", () => {
    const s = status({
      ...base,
      nablRequired: false,
      vendorIsNabl: false,
      ulrNo: "",
      nablMarkPresent: null,
      labAccreditationNo: "",
    });
    expect(s).toMatchObject({ ulrNo: "na", nablMark: "na", accreditationMatches: "na" });
    expect(checklistOutcome(evaluateChecklist({ ...base, uncertaintyStated: null })).pending).toEqual(["uncertaintyStated"]);
  });
});
