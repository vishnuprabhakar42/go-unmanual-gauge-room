import { describe, expect, it } from "vitest";
import { prefillFromExtraction, type Extraction } from "./cert-extraction";

const e: Extraction = {
  certificateNo: "PCL/26/0042",
  ulrNo: "CC245126000004211F",
  calibrationDate: "2026-10-20",
  nextDueDate: "2027-10-19",
  labName: "Precision Calibration Labs",
  accreditationNo: "CC-2451",
  nablMarkPresent: true,
  instrumentSerial: "PRG 123456",
  readings: [
    { pointLabel: "2 bar", nominal: 2, asFound: null, asLeft: 2.04, permissibleError: 0.1, uncertainty: 0.03 },
    { pointLabel: null, nominal: 4, asFound: 4.1, asLeft: 4.02, permissibleError: null, uncertainty: null },
  ],
  confidence: { certificateNo: 0.98, ulrNo: 0.62, calibrationDate: 0.91, accreditationNo: 0.7, readings: 0.85 },
};

describe("AI extraction prefill", () => {
  it("maps fields, fills default tolerance and flags low confidence", () => {
    const p = prefillFromExtraction(e, { instrumentSerial: "PRG-123456", defaultPermissible: 0.1 });
    expect(p.certificateNo).toBe("PCL/26/0042");
    expect(p.calibratedAt).toBe("2026-10-20");
    expect(p.readings[1]).toEqual({
      pointLabel: "Point 2",
      nominal: "4",
      asFound: "4.1",
      asLeft: "4.02",
      permissibleError: "0.1",
      uncertainty: "",
    });
    expect(p.lowConfidence.sort()).toEqual(["labAccreditationNo", "ulrNo"]);
    expect(p.serialMismatch).toBe(false);
    expect(p.overallConfidence).toBe(0.62);
  });
  it("detects a certificate for a different instrument and rejects malformed dates", () => {
    const p = prefillFromExtraction(
      { ...e, instrumentSerial: "XYZ999", calibrationDate: "20/10/2026" },
      { instrumentSerial: "PRG-123456", defaultPermissible: null },
    );
    expect(p.serialMismatch).toBe(true);
    expect(p.calibratedAt).toBe("");
  });
});
