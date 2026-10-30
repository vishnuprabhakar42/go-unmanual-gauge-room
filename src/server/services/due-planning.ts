import type { Prisma } from "@/generated/prisma/client";
import { sequential } from "@/server/sequential";
import {
  AGING_BUCKETS,
  agingBucket,
  daysSince,
  monthKey,
  monthRange,
  startOfIstDay,
  upcomingMonths,
  type AgingBucket,
  type DueConfig,
} from "@/domain/due";
import { OPEN_REQUEST_STATUSES } from "@/domain/calibration-request-status";
import { parseOrgSettings } from "@/domain/settings";
import type { TenantClient } from "@/server/tenant";
import { instrumentWhere } from "./instruments";

type Db = Pick<TenantClient, "organization" | "instrumentType" | "instrument" | "department">;

/** Org window + per-type lead times, for due filters. */
export async function loadDueConfig(db: Pick<TenantClient, "organization" | "instrumentType">): Promise<DueConfig> {
  const [org, types] = await sequential([
    db.organization.findFirstOrThrow({ select: { settings: true } }),
    db.instrumentType.findMany({
      where: { defaultLeadTimeDays: { not: null } },
      select: { id: true, defaultLeadTimeDays: true },
    }),
  ]);
  return {
    orgDays: parseOrgSettings(org.settings).dueSoonDays,
    typeLeads: types.map((t) => ({ typeId: t.id, lead: t.defaultLeadTimeDays! })),
  };
}

export type DashboardStats = {
  active: number;
  overdue: number;
  dueSoon: number;
  atVendor: number;
  aging: Record<AgingBucket, number>;
  awaitingVerification: number;
  /** Planning date reached and not yet on a calibration request */
  planningReached: number;
  /** OOT cases not yet closed (held instruments and as-found assessments) */
  openOot: number;
  dueByMonth: { month: string; count: number }[];
  overdueByDepartment: { departmentId: string | null; name: string; count: number }[];
  openRequests: number;
};

/**
 * Everything the dashboard shows, scoped to the tenant (and plant when given). All counts are live
 * queries, so editing an instrument's last calibration date is reflected on the next render.
 */
export async function dashboardStats(
  db: Db & Pick<TenantClient, "calibrationRequest" | "ootCase">,
  due: DueConfig,
  plantId: string | null,
  now = new Date(),
): Promise<DashboardStats> {
  const base: Prisma.InstrumentWhereInput = { archivedAt: null, ...(plantId ? { plantId } : {}) };
  const active: Prisma.InstrumentWhereInput = { ...base, status: { notIn: ["SCRAPPED", "LOST"] } };
  const months = upcomingMonths(6, now);
  // Current month counts from today (earlier days are in "overdue"), up to the end of the 6th month.
  const upcomingRange = { gte: startOfIstDay(now), lt: monthRange(months[months.length - 1]).lt };

  const [
    activeCount,
    overdue,
    dueSoon,
    atVendorRows,
    awaitingVerification,
    openOot,
    upcoming,
    byDept,
    openRequests,
    planningReached,
  ] = await Promise.all([
    db.instrument.count({ where: active }),
    db.instrument.count({ where: { ...instrumentWhere({ due: "OVERDUE", plantId }, due, now) } }),
    db.instrument.count({ where: { ...instrumentWhere({ due: "DUE_SOON", plantId }, due, now) } }),
    db.instrument.findMany({ where: { ...base, status: "AT_VENDOR" }, select: { statusChangedAt: true } }),
    db.instrument.count({ where: { ...base, status: "RECEIVED_PENDING_VERIFICATION" } }),
    db.ootCase.count({ where: { status: { not: "CLOSED" }, ...(plantId ? { plantId } : {}) } }),
    db.instrument.findMany({ where: { ...active, nextDueAt: upcomingRange }, select: { nextDueAt: true } }),
    db.instrument.groupBy({
      by: ["departmentId"],
      where: instrumentWhere({ due: "OVERDUE", plantId }, due, now),
      _count: { _all: true },
    }),
    db.calibrationRequest.count({ where: { status: { in: [...OPEN_REQUEST_STATUSES] }, ...(plantId ? { plantId } : {}) } }),
    // planning date reached (incl. overdue) and not yet on an open calibration request — the due page's default view
    db.instrument.count({ where: instrumentWhere({ due: "ACTION", plantId, notInOpenRequest: true }, due, now) }),
  ]);

  const aging = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  for (const r of atVendorRows) aging[agingBucket(daysSince(r.statusChangedAt, now))]++;

  const perMonth = new Map(months.map((m) => [m, 0]));
  for (const r of upcoming) if (r.nextDueAt) perMonth.set(monthKey(r.nextDueAt), (perMonth.get(monthKey(r.nextDueAt)) ?? 0) + 1);

  const deptIds = byDept.map((d) => d.departmentId).filter((x): x is string => !!x);
  const depts = new Map(
    (
      await db.department.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, name: true, plant: { select: { code: true } } },
      })
    ).map((d) => [d.id, plantId ? d.name : `${d.plant.code} · ${d.name}`]),
  );

  return {
    active: activeCount,
    overdue,
    dueSoon,
    atVendor: atVendorRows.length,
    aging,
    awaitingVerification,
    openOot,
    planningReached,
    dueByMonth: months.map((m) => ({ month: m, count: perMonth.get(m) ?? 0 })),
    overdueByDepartment: byDept
      .map((d) => ({
        departmentId: d.departmentId,
        name: d.departmentId ? (depts.get(d.departmentId) ?? "—") : "—",
        count: d._count._all,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    openRequests,
  };
}
