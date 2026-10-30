import { randomBytes } from "node:crypto";
import type { z } from "zod";
import type { InstrumentEventType, Prisma } from "@/generated/prisma/client";
import { computeNextDue, isMonthKey, monthRange, planningClauses, type DueConfig, type DueFilter } from "@/domain/due";
import { OPEN_REQUEST_STATUSES } from "@/domain/calibration-request-status";
import type { instrumentSchema } from "@/domain/instrument-schemas";
import { InvalidTransitionError, transitionInstrument, type InstrumentStatus } from "@/domain/instrument-status";
import { UserError } from "@/server/errors";
import { currentTenant, type TenantClient, type TenantTx } from "@/server/tenant";

type InstrumentData = z.output<typeof instrumentSchema>;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 12-char random token for /i/{qrToken} (≈71 bits; not guessable, short enough for small QR codes). */
export function newQrToken(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => BASE62[b % 62]).join("");
}

export async function recordEvent(
  tx: TenantTx,
  instrumentId: string,
  type: InstrumentEventType,
  payload: Prisma.InputJsonValue = {},
) {
  const { organizationId, actorId } = currentTenant();
  await tx.instrumentEvent.create({ data: { organizationId, instrumentId, type, payload, actorId } });
}

async function assertRefs(tx: TenantTx, data: InstrumentData) {
  const type = await tx.instrumentType.findUnique({ where: { id: data.typeId } });
  if (!type || type.archivedAt) throw new UserError("Choose an active instrument type", { typeId: ["Invalid type"] });
  await tx.plant.findUniqueOrThrow({ where: { id: data.plantId } });
  if (data.departmentId) {
    const d = await tx.department.findUnique({ where: { id: data.departmentId } });
    if (!d || d.plantId !== data.plantId)
      throw new UserError("Department must belong to the plant", { departmentId: ["Invalid"] });
  }
  if (data.locationId) {
    const l = await tx.location.findUnique({ where: { id: data.locationId } });
    if (!l || l.plantId !== data.plantId) throw new UserError("Location must belong to the plant", { locationId: ["Invalid"] });
  }
}

/** lastCalibratedAt wins: next due is always derived from it when present. */
function scheduleFields(data: Pick<InstrumentData, "lastCalibratedAt" | "nextDueAt" | "frequencyValue" | "frequencyUnit">) {
  const nextDueAt = data.lastCalibratedAt
    ? computeNextDue(data.lastCalibratedAt, data.frequencyValue, data.frequencyUnit)
    : (data.nextDueAt ?? null);
  return { lastCalibratedAt: data.lastCalibratedAt ?? null, nextDueAt };
}

async function assertCodeFree(tx: TenantTx, code: string, exceptId?: string) {
  const dup = await tx.instrument.findFirst({
    where: { code: { equals: code, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (dup) throw new UserError(`Code ${code} is already used`, { code: ["Already used"] });
}

export async function createInstrument(tx: TenantTx, data: InstrumentData) {
  await assertRefs(tx, data);
  await assertCodeFree(tx, data.code);
  const instrument = await tx.instrument.create({
    data: {
      ...data,
      ...scheduleFields(data),
      organizationId: currentTenant().organizationId,
      qrToken: newQrToken(),
      status: "IN_STORE",
    },
  });
  await recordEvent(tx, instrument.id, "CREATED", { source: "manual" });
  return instrument;
}

const TRACKED_FIELDS = [
  "code",
  "typeId",
  "description",
  "make",
  "model",
  "serialNo",
  "rangeMin",
  "rangeMax",
  "unit",
  "leastCount",
  "tolerancePlus",
  "toleranceMinus",
  "acceptanceCriteria",
  "custodianName",
  "criticality",
  "calibrationSource",
  "frequencyValue",
  "frequencyUnit",
  "lastCalibratedAt",
  "nextDueAt",
  "nablRequired",
  "purchaseValue",
  "notes",
  "planLeadDays",
  "standardCode",
  "standardDate",
  "adjustable",
] as const;

function comparable(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export async function updateInstrument(tx: TenantTx, id: string, data: InstrumentData) {
  const before = await tx.instrument.findUniqueOrThrow({ where: { id } });
  if (before.archivedAt) throw new UserError("Restore the instrument before editing it");
  await assertRefs(tx, data);
  if (data.code.toUpperCase() !== before.code.toUpperCase()) await assertCodeFree(tx, data.code, id);

  const after = await tx.instrument.update({ where: { id }, data: { ...data, ...scheduleFields(data) } });

  const changed = TRACKED_FIELDS.filter((f) => comparable(before[f]) !== comparable(after[f]));
  if (changed.length) await recordEvent(tx, id, "EDITED", { fields: changed });
  if (before.plantId !== after.plantId || before.departmentId !== after.departmentId || before.locationId !== after.locationId) {
    await recordEvent(tx, id, "MOVED", {
      from: { plantId: before.plantId, departmentId: before.departmentId, locationId: before.locationId },
      to: { plantId: after.plantId, departmentId: after.departmentId, locationId: after.locationId },
    });
  }
  return after;
}

/** The only way to change an instrument's status (state machine enforced). */
export async function changeInstrumentStatus(tx: TenantTx, id: string, to: InstrumentStatus, reason?: string | null) {
  const current = await tx.instrument.findUniqueOrThrow({ where: { id } });
  let result: ReturnType<typeof transitionInstrument>;
  try {
    result = transitionInstrument({ from: current.status, to, reason });
  } catch (err) {
    if (err instanceof InvalidTransitionError) throw new UserError(err.message);
    throw err;
  }
  await tx.instrument.update({ where: { id }, data: { status: result.status, statusChangedAt: new Date() } });
  await recordEvent(tx, id, "STATUS_CHANGED", result.payload);
}

export async function setInstrumentArchived(tx: TenantTx, id: string, archived: boolean) {
  return tx.instrument.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

// ─────────────────────────── List query ───────────────────────────

export type InstrumentFilters = {
  q?: string;
  plantId?: string | null;
  status?: InstrumentStatus;
  typeId?: string;
  departmentId?: string;
  criticality?: "A" | "B" | "C";
  due?: DueFilter | "NOT_SCHEDULED";
  /** "YYYY-MM": next due falls in this IST month */
  month?: string;
  /** Hide instruments already in an open calibration request */
  notInOpenRequest?: boolean;
  archived?: boolean;
  ids?: string[];
};

export const INSTRUMENT_SORTS = ["code", "nextDueAt", "planningDate", "lastCalibratedAt", "updatedAt"] as const;
export type InstrumentSort = (typeof INSTRUMENT_SORTS)[number];

export function instrumentWhere(f: InstrumentFilters, due: DueConfig, now = new Date()): Prisma.InstrumentWhereInput {
  const where: Prisma.InstrumentWhereInput = { archivedAt: f.archived ? { not: null } : null };
  const and: Prisma.InstrumentWhereInput[] = [];
  if (f.ids?.length) where.id = { in: f.ids };
  if (f.plantId) where.plantId = f.plantId;
  if (f.status) where.status = f.status;
  if (f.typeId) where.typeId = f.typeId;
  if (f.departmentId) where.departmentId = f.departmentId;
  if (f.criticality) where.criticality = f.criticality;
  if (f.due === "NOT_SCHEDULED") where.nextDueAt = null;
  else if (f.due) {
    // planningDate (DB-maintained: next due − instrument/type/org lead days) encodes every due window
    and.push(planningClauses(f.due, now));
  }
  if (isMonthKey(f.month)) and.push({ nextDueAt: monthRange(f.month) });
  // Scrapped/lost instruments are never "due"
  if ((f.due || f.month) && !f.status) where.status = { notIn: ["SCRAPPED", "LOST"] };
  if (f.notInOpenRequest) {
    where.requestItems = { none: { removedAt: null, request: { status: { in: [...OPEN_REQUEST_STATUSES] } } } };
  }
  if (and.length) where.AND = and;
  const q = f.q?.trim();
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { serialNo: { contains: q, mode: "insensitive" } },
      { make: { contains: q, mode: "insensitive" } },
      { custodianName: { contains: q, mode: "insensitive" } },
      { type: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export const instrumentListSelect = {
  id: true,
  code: true,
  description: true,
  make: true,
  serialNo: true,
  status: true,
  criticality: true,
  lastCalibratedAt: true,
  nextDueAt: true,
  rangeMin: true,
  rangeMax: true,
  unit: true,
  leastCount: true,
  planningDate: true,
  standardCode: true,
  standardDate: true,
  adjustable: true,
  custodianName: true,
  type: { select: { id: true, name: true, defaultLeadTimeDays: true, standardCode: true, standardDate: true } },
  plant: { select: { code: true } },
  department: { select: { name: true } },
  location: { select: { name: true } },
} satisfies Prisma.InstrumentSelect;

export async function listInstruments(
  db: Pick<TenantClient, "instrument">,
  opts: {
    filters: InstrumentFilters;
    due: DueConfig;
    page: number;
    pageSize: number;
    sort: InstrumentSort;
    dir: "asc" | "desc";
  },
) {
  const where = instrumentWhere(opts.filters, opts.due);
  const orderBy: Prisma.InstrumentOrderByWithRelationInput[] =
    opts.sort === "code" ? [{ code: opts.dir }] : [{ [opts.sort]: { sort: opts.dir, nulls: "last" } }, { code: "asc" }];
  const [rows, total] = await Promise.all([
    db.instrument.findMany({
      where,
      orderBy,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: instrumentListSelect,
    }),
    db.instrument.count({ where }),
  ]);
  return { rows, total };
}
