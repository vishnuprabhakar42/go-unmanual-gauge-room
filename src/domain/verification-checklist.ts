/**
 * Certificate verification checklist (IATF 16949 7.1.5.2 / ISO 17025 certificate content).
 * Auto items are computed from data; manual items need the verifier's confirmation.
 */
export const CHECKLIST_KEYS = [
  "certificateNo",
  "ulrNo",
  "calibrationDate",
  "nablMark",
  "accreditationMatches",
  "withinScope",
  "uncertaintyStated",
  "resultsWithinTolerance",
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export type CheckStatus = "pass" | "fail" | "na" | "pending";
export type CheckItem = { key: ChecklistKey; status: CheckStatus; auto: boolean; detail?: string };

export type ChecklistInput = {
  nablRequired: boolean;
  certificateNo: string;
  ulrNo: string;
  calibratedAt: Date | null;
  sentAt: Date | null;
  receivedAt: Date | null;
  nablMarkPresent: boolean | null;
  labAccreditationNo: string;
  vendorNablCertNo: string | null;
  vendorIsNabl: boolean;
  withinScope: boolean | null;
  uncertaintyStated: boolean | null;
  readingsResult: "PASS" | "FAIL" | null;
  now?: Date;
};

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function evaluateChecklist(i: ChecklistInput): CheckItem[] {
  const now = i.now ?? new Date();
  const dateStatus = (): { status: CheckStatus; detail?: string } => {
    if (!i.calibratedAt) return { status: "pending" };
    if (i.calibratedAt > now) return { status: "fail", detail: "Calibration date is in the future" };
    // Allow 1 day slack for time zones; the lab can't calibrate before receiving the instrument
    if (i.sentAt && i.calibratedAt.getTime() < i.sentAt.getTime() - 86_400_000)
      return { status: "fail", detail: "Calibration date is before the instrument was sent" };
    return { status: "pass" };
  };
  const accreditation = (): { status: CheckStatus; detail?: string } => {
    if (!i.nablRequired && !i.vendorIsNabl) return { status: "na" };
    if (!i.labAccreditationNo.trim()) return { status: "pending" };
    if (!i.vendorNablCertNo) return { status: "fail", detail: "Lab has no NABL certificate on file" };
    return norm(i.labAccreditationNo) === norm(i.vendorNablCertNo)
      ? { status: "pass" }
      : { status: "fail", detail: `Certificate shows ${i.labAccreditationNo}; lab on file is ${i.vendorNablCertNo}` };
  };
  const bool = (v: boolean | null, required = true): CheckStatus =>
    !required ? "na" : v == null ? "pending" : v ? "pass" : "fail";
  return [
    { key: "certificateNo", status: i.certificateNo.trim() ? "pass" : "pending", auto: true },
    { key: "ulrNo", status: !i.nablRequired ? "na" : i.ulrNo.trim() ? "pass" : "pending", auto: true },
    { key: "calibrationDate", auto: true, ...dateStatus() },
    { key: "nablMark", status: bool(i.nablMarkPresent, i.nablRequired), auto: false },
    { key: "accreditationMatches", auto: true, ...accreditation() },
    { key: "withinScope", status: i.withinScope == null ? "pending" : i.withinScope ? "pass" : "fail", auto: true },
    { key: "uncertaintyStated", status: bool(i.uncertaintyStated), auto: false },
    {
      key: "resultsWithinTolerance",
      status: i.readingsResult == null ? "pending" : i.readingsResult === "PASS" ? "pass" : "fail",
      auto: true,
    },
  ];
}

/**
 * Can the verifier record a decision? Every item must be decided (no "pending"). Document items that
 * fail (number, ULR, date, NABL mark, accreditation, scope, uncertainty) mean the certificate itself is
 * defective → reject it back to the lab. A failing results item is a legitimate FAIL decision (OOT).
 */
export function checklistOutcome(items: readonly CheckItem[]): {
  canDecide: boolean;
  mustReject: boolean;
  pending: ChecklistKey[];
  documentFailures: ChecklistKey[];
} {
  const pending = items.filter((i) => i.status === "pending").map((i) => i.key);
  const documentFailures = items.filter((i) => i.status === "fail" && i.key !== "resultsWithinTolerance").map((i) => i.key);
  return {
    canDecide: pending.length === 0 && documentFailures.length === 0,
    mustReject: documentFailures.length > 0,
    pending,
    documentFailures,
  };
}
