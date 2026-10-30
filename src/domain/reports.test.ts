import { describe, expect, it } from "vitest";
import { monthsBetween, spendByVendorMonth, vendorPerformance, type PerformanceRow } from "./reports";

const d = (s: string) => new Date(`${s}T10:00:00+05:30`);

describe("vendorPerformance", () => {
  it("computes on-time %, average TAT and OOT rate per vendor", () => {
    const rows: PerformanceRow[] = [
      { vendorId: "a", vendorName: "Lab A", sentAt: d("2026-09-01"), receivedAt: d("2026-09-08"), tatDays: 7, result: "PASS" },
      { vendorId: "a", vendorName: "Lab A", sentAt: d("2026-09-01"), receivedAt: d("2026-09-12"), tatDays: 7, result: "FAIL" },
      { vendorId: "a", vendorName: "Lab A", sentAt: d("2026-09-10"), receivedAt: null, tatDays: 7, result: null },
      { vendorId: "b", vendorName: "Lab B", sentAt: d("2026-09-01"), receivedAt: d("2026-09-04"), tatDays: null, result: "PASS" },
    ];
    const [a, b] = vendorPerformance(rows);
    expect(a).toMatchObject({
      vendorName: "Lab A",
      jobs: 3,
      returned: 2,
      onTime: 1,
      onTimePct: 50,
      avgTatDays: 9,
      verified: 2,
      failed: 1,
      ootRatePct: 50,
    });
    expect(b).toMatchObject({ jobs: 1, onTimePct: null, avgTatDays: 3, ootRatePct: 0 });
  });

  it("uses IST days (late-night receipt on the due day is on time)", () => {
    const [r] = vendorPerformance([
      {
        vendorId: "a",
        vendorName: "A",
        sentAt: new Date("2026-09-01T04:00:00Z"),
        receivedAt: new Date("2026-09-08T19:00:00Z"),
        tatDays: 7,
        result: null,
      },
    ]);
    // 08-09 19:00Z is 00:30 on 09-09 IST → 8 days → late
    expect(r.onTimePct).toBe(0);
  });
});

describe("spendByVendorMonth", () => {
  it("sums PO subtotals per vendor per IST month", () => {
    const t = spendByVendorMonth(
      [
        { vendorName: "Lab A", date: d("2026-08-10"), subtotal: 1000, total: 1180 },
        { vendorName: "Lab A", date: d("2026-09-02"), subtotal: 500.5, total: 590.59 },
        { vendorName: "Lab B", date: d("2026-09-20"), subtotal: 2000, total: 2360 },
        { vendorName: "Lab B", date: d("2025-01-01"), subtotal: 9999, total: 9999 },
      ],
      ["2026-08", "2026-09", "2026-10"],
    );
    expect(t.vendors[0]).toMatchObject({ vendorName: "Lab B", total: 2000 });
    expect(t.vendors[1].byMonth).toEqual({ "2026-08": 1000, "2026-09": 500.5 });
    expect(t.monthTotals).toEqual({ "2026-08": 1000, "2026-09": 2500.5, "2026-10": 0 });
    expect(t.grandTotal).toBe(3500.5);
  });
});

describe("monthsBetween", () => {
  it("spans years", () => {
    expect(monthsBetween(d("2025-11-15"), d("2026-02-01"))).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
