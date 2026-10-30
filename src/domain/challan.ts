/**
 * Returnable delivery challan rules (CGST Rule 55).
 *   DRAFT → ISSUED (number + date assigned) → [dispatched] → PARTIALLY_RETURNED → RETURNED
 *   DRAFT | ISSUED (not yet dispatched) → CANCELLED
 */
export const CHALLAN_STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_RETURNED", "RETURNED", "CANCELLED"] as const;
export type ChallanStatus = (typeof CHALLAN_STATUSES)[number];

export const CHALLAN_REASON = "Sent for calibration — returnable, not a supply";
export const TRANSIT_BUFFER_DAYS = 3;
export const COPY_LABELS = ["ORIGINAL FOR CONSIGNEE", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR CONSIGNOR"] as const;

/** Status after receipts: none returned → ISSUED, some → PARTIALLY_RETURNED, all → RETURNED. */
export function challanStatusFromReturns(items: readonly { returnedAt: Date | null }[]): ChallanStatus {
  const returned = items.filter((i) => i.returnedAt).length;
  if (returned === 0) return "ISSUED";
  return returned === items.length ? "RETURNED" : "PARTIALLY_RETURNED";
}

export function canCancelChallan(c: { status: ChallanStatus; dispatchedAt: Date | null }): boolean {
  return c.status === "DRAFT" || (c.status === "ISSUED" && !c.dispatchedAt);
}

/** Expected back = dispatch date + longest TAT on the challan + transit buffer. */
export function expectedReturn(dispatchedAt: Date, tatDays: readonly number[], buffer = TRANSIT_BUFFER_DAYS): Date {
  const longest = tatDays.length ? Math.max(...tatDays) : 7;
  return new Date(dispatchedAt.getTime() + (longest + buffer) * 86_400_000);
}

export function challanCopies(count: number): readonly string[] {
  return COPY_LABELS.slice(0, Math.min(3, Math.max(1, count)));
}

export function totalValue(items: readonly { value: number; qty?: number }[]): number {
  return Math.round(items.reduce((sum, i) => sum + i.value * 100 * (i.qty ?? 1), 0)) / 100;
}

/** Vehicle numbers like MH12AB1234 / MH 12 AB 1234 (normalised to no spaces). */
export function normalizeVehicleNo(v: string): string {
  return v.toUpperCase().replace(/[\s-]/g, "");
}

export const VEHICLE_NO_REGEX = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
/** e-way bill numbers are 12 digits. */
export const EWAY_BILL_REGEX = /^\d{12}$/;
