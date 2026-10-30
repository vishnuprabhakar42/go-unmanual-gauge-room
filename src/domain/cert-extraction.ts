/**
 * AI certificate extraction → verification form prefill. The model output is validated by zod (in the
 * server); this module only maps it and flags low-confidence fields. Nothing here approves anything.
 */
export const LOW_CONFIDENCE = 0.8;

export type Extraction = {
  certificateNo: string | null;
  ulrNo: string | null;
  calibrationDate: string | null; // YYYY-MM-DD
  nextDueDate: string | null;
  labName: string | null;
  accreditationNo: string | null;
  nablMarkPresent: boolean | null;
  instrumentSerial: string | null;
  readings: {
    pointLabel: string | null;
    nominal: number;
    asFound: number | null;
    asLeft: number;
    permissibleError: number | null;
    uncertainty: number | null;
  }[];
  confidence: Partial<
    Record<
      "certificateNo" | "ulrNo" | "calibrationDate" | "accreditationNo" | "nablMarkPresent" | "instrumentSerial" | "readings",
      number
    >
  >;
};

export type Prefill = {
  certificateNo: string;
  ulrNo: string;
  calibratedAt: string;
  labAccreditationNo: string;
  nablMarkPresent: boolean | null;
  readings: {
    pointLabel: string;
    nominal: string;
    asFound: string;
    asLeft: string;
    permissibleError: string;
    uncertainty: string;
  }[];
  lowConfidence: string[];
  serialMismatch: boolean;
  overallConfidence: number;
};

export function prefillFromExtraction(
  e: Extraction,
  ctx: { instrumentSerial: string | null; defaultPermissible: number | null },
): Prefill {
  const conf = e.confidence ?? {};
  const lowConfidence = Object.entries(conf)
    .filter(([, v]) => typeof v === "number" && v < LOW_CONFIDENCE)
    .map(([k]) => (k === "calibrationDate" ? "calibratedAt" : k === "accreditationNo" ? "labAccreditationNo" : k));
  const values = Object.values(conf).filter((v): v is number => typeof v === "number");
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  const norm = (x: string | null) => (x ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return {
    certificateNo: e.certificateNo ?? "",
    ulrNo: e.ulrNo ?? "",
    calibratedAt: e.calibrationDate && /^\d{4}-\d{2}-\d{2}$/.test(e.calibrationDate) ? e.calibrationDate : "",
    labAccreditationNo: e.accreditationNo ?? "",
    nablMarkPresent: e.nablMarkPresent,
    readings: e.readings.map((r, i) => ({
      pointLabel: r.pointLabel ?? `Point ${i + 1}`,
      nominal: s(r.nominal),
      asFound: s(r.asFound),
      asLeft: s(r.asLeft),
      permissibleError: s(r.permissibleError ?? ctx.defaultPermissible),
      uncertainty: s(r.uncertainty),
    })),
    lowConfidence,
    serialMismatch: !!(e.instrumentSerial && ctx.instrumentSerial && norm(e.instrumentSerial) !== norm(ctx.instrumentSerial)),
    overallConfidence: values.length ? Math.min(...values) : 0,
  };
}
