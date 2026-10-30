import { agingBucket, daysSince, istMidnight } from "@/domain/due";
import { istParts, toDateInput } from "@/domain/india/format";
import { monthsBetween, spendByVendorMonth, vendorPerformance } from "@/domain/reports";
import type { TenantClient } from "@/server/tenant";
import { loadDueConfig } from "./due-planning";
import { instrumentWhere } from "./instruments";

export type ReportPeriod = { plantId: string | null; from: Date; to: Date };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const parseDay = (s: string | undefined) => {
  if (!s || !DATE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return istMidnight(y, m, d);
};
const endOfDay = (d: Date) => new Date(d.getTime() + 86_400_000 - 1);

/** Start of the current Indian financial year (1 April, IST). */
export function fyStart(now = new Date()): Date {
  const p = istParts(now);
  return istMidnight(p.month >= 4 ? p.year : p.year - 1, 4, 1);
}

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, IST); defaults to this financial year to date. */
export function parsePeriod(
  sp: Record<string, string | string[] | undefined>,
  plantId: string | null,
  now = new Date(),
): ReportPeriod & { fromInput: string; toInput: string } {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  let from = parseDay(one("from")) ?? fyStart(now);
  let to = parseDay(one("to")) ?? istMidnight(istParts(now).year, istParts(now).month, istParts(now).day);
  if (to < from) [from, to] = [to, from];
  return { plantId, from, to: endOfDay(to), fromInput: toDateInput(from), toInput: toDateInput(to) };
}

const plantWhere = (plantId: string | null) => (plantId ? { plantId } : {});

/** Vendor performance for jobs dispatched in the period. */
export async function vendorPerformanceReport(db: Pick<TenantClient, "calibrationJob">, p: ReportPeriod) {
  const jobs = await db.calibrationJob.findMany({
    where: {
      ...plantWhere(p.plantId),
      vendorId: { not: null },
      sentAt: { gte: p.from, lte: p.to },
      status: { not: "CANCELLED" },
    },
    select: {
      vendorId: true,
      sentAt: true,
      receivedAt: true,
      result: true,
      vendor: { select: { name: true } },
      poItem: { select: { tatDays: true } },
    },
  });
  return vendorPerformance(
    jobs.map((j) => ({
      vendorId: j.vendorId!,
      vendorName: j.vendor?.name ?? "—",
      sentAt: j.sentAt,
      receivedAt: j.receivedAt,
      tatDays: j.poItem?.tatDays ?? null,
      result: j.result,
    })),
  );
}

/** Calibration spend: sent POs (excl. GST) by vendor and month of sending. */
export async function spendReport(db: Pick<TenantClient, "purchaseOrder">, p: ReportPeriod) {
  const pos = await db.purchaseOrder.findMany({
    where: { ...plantWhere(p.plantId), status: { in: ["SENT", "ACKNOWLEDGED", "CLOSED"] }, sentAt: { gte: p.from, lte: p.to } },
    select: { sentAt: true, subtotal: true, total: true, vendor: { select: { name: true } } },
  });
  return spendByVendorMonth(
    pos.map((po) => ({
      vendorName: po.vendor.name,
      date: po.sentAt!,
      subtotal: po.subtotal.toNumber(),
      total: po.total.toNumber(),
    })),
    monthsBetween(p.from, p.to),
  );
}

/** Instruments out at labs now, oldest first, with days out and the expected return date. */
export async function atVendorAgingReport(db: Pick<TenantClient, "calibrationJob">, plantId: string | null, now = new Date()) {
  const jobs = await db.calibrationJob.findMany({
    where: { ...plantWhere(plantId), status: { in: ["DISPATCHED", "AT_LAB"] }, sentAt: { not: null } },
    orderBy: { sentAt: "asc" },
    take: 5000,
    select: {
      sentAt: true,
      labProgress: true,
      instrument: { select: { id: true, code: true, description: true, type: { select: { name: true } } } },
      vendor: { select: { name: true } },
      poItem: { select: { tatDays: true, po: { select: { number: true } } } },
      challanItem: { select: { challan: { select: { number: true } } } },
    },
  });
  return jobs.map((j) => {
    const days = daysSince(j.sentAt!, now);
    const expected = j.poItem ? new Date(j.sentAt!.getTime() + j.poItem.tatDays * 86_400_000) : null;
    return {
      instrumentId: j.instrument.id,
      code: j.instrument.code,
      type: j.instrument.type.name,
      vendor: j.vendor?.name ?? "—",
      po: j.poItem?.po.number ?? null,
      challan: j.challanItem?.challan.number ?? null,
      sentAt: j.sentAt!,
      expected,
      days,
      bucket: agingBucket(days),
      late: !!expected && expected < now,
      labProgress: j.labProgress,
    };
  });
}

/** Due list: overdue + due soon (per-type windows), soonest first. */
export async function dueListReport(
  db: Pick<TenantClient, "instrument" | "organization" | "instrumentType">,
  plantId: string | null,
) {
  const due = await loadDueConfig(db);
  return db.instrument.findMany({
    where: instrumentWhere({ due: "ACTION", plantId }, due),
    orderBy: [{ nextDueAt: { sort: "asc", nulls: "last" } }, { code: "asc" }],
    take: 20_000,
    select: {
      code: true,
      description: true,
      serialNo: true,
      status: true,
      lastCalibratedAt: true,
      nextDueAt: true,
      calibrationSource: true,
      type: { select: { name: true } },
      plant: { select: { code: true } },
      department: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
}
