/**
 * Calibration request lifecycle:
 *   DRAFT → SUBMITTED → APPROVED → SOURCING → PO_RAISED → CLOSED
 *   SUBMITTED → DRAFT (sent back);  any open status → CANCELLED
 * Approval can be skipped by org setting (SUBMITTED → APPROVED done automatically by the service).
 */
export const REQUEST_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "SOURCING", "PO_RAISED", "CLOSED", "CANCELLED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SOURCING", "CANCELLED"],
  SOURCING: ["PO_RAISED", "CANCELLED"],
  PO_RAISED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

/** Requests that still "hold" their instruments (an instrument can be in only one open request). */
export const OPEN_REQUEST_STATUSES: readonly RequestStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "SOURCING", "PO_RAISED"];

export function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_TRANSITIONS[from].includes(to);
}

export function assertRequestTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransitionRequest(from, to)) throw new Error(`Cannot move request from ${from} to ${to}`);
}

export function isEditable(status: RequestStatus): boolean {
  return status === "DRAFT";
}
