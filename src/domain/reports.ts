import { monthKey } from "./due";

/**
 * Report maths (pure). Days are IST calendar days.
 * - On-time: returned (inward receipt) on or before sent date + the PO's turnaround days.
 * - TAT: calendar days from dispatch to inward receipt.
 * - OOT rate: failed verifications ÷ verified jobs.
 */
const IST_OFFSET = 330 * 60_000;
const istDay = (d: Date) => Math.floor((d.getTime() + IST_OFFSET) / 86_400_000);

export type PerformanceRow = {
  vendorId: string;
  vendorName: string;
  sentAt: Date | null;
  receivedAt: Date | null;
  tatDays: number | null;
  /** Any recorded result counts as verified; only FAIL counts as OOT */
  result: string | null;
};

export type VendorPerformance = {
  vendorId: string;
  vendorName: string;
  jobs: number;
  returned: number;
  onTime: number;
  onTimePct: number | null;
  avgTatDays: number | null;
  verified: number;
  failed: number;
  ootRatePct: number | null;
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

export function vendorPerformance(rows: readonly PerformanceRow[]): VendorPerformance[] {
  const by = new Map<string, PerformanceRow[]>();
  for (const r of rows) by.set(r.vendorId, [...(by.get(r.vendorId) ?? []), r]);
  return [...by.values()]
    .map((rs) => {
      const returned = rs.filter((r) => r.sentAt && r.receivedAt);
      const tats = returned.map((r) => istDay(r.receivedAt!) - istDay(r.sentAt!));
      const judged = returned.filter((r) => r.tatDays != null);
      const onTime = judged.filter((r) => istDay(r.receivedAt!) - istDay(r.sentAt!) <= r.tatDays!).length;
      const verified = rs.filter((r) => r.result).length;
      const failed = rs.filter((r) => r.result === "FAIL").length;
      return {
        vendorId: rs[0].vendorId,
        vendorName: rs[0].vendorName,
        jobs: rs.length,
        returned: returned.length,
        onTime,
        onTimePct: pct(onTime, judged.length),
        avgTatDays: tats.length ? Math.round((tats.reduce((a, b) => a + b, 0) / tats.length) * 10) / 10 : null,
        verified,
        failed,
        ootRatePct: pct(failed, verified),
      };
    })
    .sort((a, b) => b.jobs - a.jobs || a.vendorName.localeCompare(b.vendorName));
}

export type SpendRow = { vendorName: string; date: Date; subtotal: number; total: number };
export type SpendTable = {
  months: string[];
  vendors: { vendorName: string; byMonth: Record<string, number>; total: number }[];
  monthTotals: Record<string, number>;
  grandTotal: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Spend (PO subtotal, excl. GST) per vendor per IST month; months with no spend in range are kept. */
export function spendByVendorMonth(rows: readonly SpendRow[], months: readonly string[]): SpendTable {
  const vendors = new Map<string, Record<string, number>>();
  const monthTotals: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  for (const r of rows) {
    const m = monthKey(r.date);
    if (!(m in monthTotals)) continue;
    const v = vendors.get(r.vendorName) ?? {};
    v[m] = round2((v[m] ?? 0) + r.subtotal);
    vendors.set(r.vendorName, v);
    monthTotals[m] = round2(monthTotals[m] + r.subtotal);
  }
  const list = [...vendors.entries()]
    .map(([vendorName, byMonth]) => ({ vendorName, byMonth, total: round2(Object.values(byMonth).reduce((a, b) => a + b, 0)) }))
    .sort((a, b) => b.total - a.total);
  return { months: [...months], vendors: list, monthTotals, grandTotal: round2(list.reduce((a, v) => a + v.total, 0)) };
}

/** Month keys from `from` to `to` inclusive. */
export function monthsBetween(from: Date, to: Date): string[] {
  const [fy, fm] = monthKey(from).split("-").map(Number);
  const [ty, tm] = monthKey(to).split("-").map(Number);
  const out: string[] = [];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (out.length > 120) break;
  }
  return out;
}
