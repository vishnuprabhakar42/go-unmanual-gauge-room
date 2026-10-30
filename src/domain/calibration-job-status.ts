/**
 * Calibration job lifecycle (one calibration of one instrument):
 *   PLANNED → PO_RAISED → DISPATCHED → AT_LAB → RETURNED → CERT_UPLOADED → VERIFIED_PASS | VERIFIED_FAIL → CLOSED
 * In-house jobs (no vendor) skip PO and dispatch: PLANNED → CERT_UPLOADED.
 * A lab may send an instrument back before reporting AT_LAB (DISPATCHED → RETURNED).
 * Open jobs can be CANCELLED (e.g. PO cancelled) until the instrument has left the plant.
 */
export const JOB_STATUSES = [
  "PLANNED",
  "PO_RAISED",
  "DISPATCHED",
  "AT_LAB",
  "RETURNED",
  "CERT_UPLOADED",
  "VERIFIED_PASS",
  "VERIFIED_FAIL",
  "CLOSED",
  "CANCELLED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  PLANNED: ["PO_RAISED", "CERT_UPLOADED", "CANCELLED"],
  PO_RAISED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["AT_LAB", "RETURNED"],
  AT_LAB: ["RETURNED"],
  RETURNED: ["CERT_UPLOADED"],
  // RETURNED again when the verifier rejects the certificate (lab must send a corrected one)
  CERT_UPLOADED: ["VERIFIED_PASS", "VERIFIED_FAIL", "RETURNED"],
  VERIFIED_PASS: ["CLOSED"],
  VERIFIED_FAIL: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionJob(from: JobStatus, to: JobStatus, opts: { inHouse?: boolean } = {}): boolean {
  if (to === "CERT_UPLOADED" && from === "PLANNED") return !!opts.inHouse;
  return JOB_TRANSITIONS[from].includes(to);
}

export function assertJobTransition(from: JobStatus, to: JobStatus, opts: { inHouse?: boolean } = {}): void {
  if (!canTransitionJob(from, to, opts)) throw new Error(`Cannot move calibration job from ${from} to ${to}`);
}

/** Jobs that still have the instrument "in the calibration loop". */
export const OPEN_JOB_STATUSES: readonly JobStatus[] = [
  "PLANNED",
  "PO_RAISED",
  "DISPATCHED",
  "AT_LAB",
  "RETURNED",
  "CERT_UPLOADED",
];
