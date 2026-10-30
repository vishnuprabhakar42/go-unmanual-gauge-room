/** Purchase order, RFQ and rate-contract lifecycles. */
export const PO_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACKNOWLEDGED", "CLOSED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_TRANSITIONS: Readonly<Record<PoStatus, readonly PoStatus[]>> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: ["ACKNOWLEDGED", "CLOSED"],
  ACKNOWLEDGED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export const RFQ_STATUSES = ["OPEN", "CLOSED", "AWARDED", "CANCELLED"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];
export const RFQ_TRANSITIONS: Readonly<Record<RfqStatus, readonly RfqStatus[]>> = {
  OPEN: ["CLOSED", "AWARDED", "CANCELLED"],
  CLOSED: ["AWARDED", "OPEN", "CANCELLED"],
  AWARDED: [],
  CANCELLED: [],
};

export function assertTransition<S extends string>(map: Readonly<Record<S, readonly S[]>>, from: S, to: S, what: string): void {
  if (!map[from].includes(to)) throw new Error(`Cannot move ${what} from ${from} to ${to}`);
}

/** A contract is in force only when ACTIVE and today is within its dates. */
export function contractInForce(
  c: { status: "DRAFT" | "ACTIVE" | "EXPIRED"; validFrom: Date; validTo: Date },
  now: Date = new Date(),
): boolean {
  return c.status === "ACTIVE" && now >= c.validFrom && now <= c.validTo;
}

/** Display status: an ACTIVE contract past its end date shows as EXPIRED even before the nightly job runs. */
export function effectiveContractStatus(
  c: { status: "DRAFT" | "ACTIVE" | "EXPIRED"; validTo: Date },
  now: Date = new Date(),
): "DRAFT" | "ACTIVE" | "EXPIRED" {
  return c.status === "ACTIVE" && now > c.validTo ? "EXPIRED" : c.status;
}
