import { daysUntilDue, dueStateFromPlanning } from "@/domain/due";
import { effectiveStandard } from "@/domain/standards";
import type { listInstruments } from "@/server/services/instruments";
import type { InstrumentRow } from "./instruments-table";

type ListRow = Awaited<ReturnType<typeof listInstruments>>["rows"][number];

const num = (d: { toNumber(): number } | null) => (d == null ? null : d.toNumber());

/** DB rows → serializable table rows; due state comes from the stored planning date. */
export function toInstrumentRows(rows: ListRow[], now = new Date()): InstrumentRow[] {
  return rows.map((r) => {
    const terminal = r.status === "SCRAPPED" || r.status === "LOST";
    return {
      id: r.id,
      code: r.code,
      type: r.type.name,
      description: r.description,
      serialNo: r.serialNo,
      make: r.make,
      status: r.status,
      criticality: r.criticality,
      plant: r.plant.code,
      department: r.department?.name ?? null,
      location: r.location?.name ?? null,
      range:
        r.rangeMin != null && r.rangeMax != null
          ? `${r.rangeMin.toNumber()}–${r.rangeMax.toNumber()} ${r.unit ?? ""}`.trim()
          : null,
      leastCount: r.leastCount != null ? `${num(r.leastCount)} ${r.unit ?? ""}`.trim() : null,
      standardCode: effectiveStandard(r).standardCode,
      standardDate: effectiveStandard(r).standardDate?.toISOString() ?? null,
      standardInherited: effectiveStandard(r).inherited,
      adjustable: r.adjustable,
      planningDate: r.planningDate?.toISOString() ?? null,
      lastCalibratedAt: r.lastCalibratedAt?.toISOString() ?? null,
      nextDueAt: r.nextDueAt?.toISOString() ?? null,
      dueState: terminal ? "NOT_SCHEDULED" : dueStateFromPlanning(r.nextDueAt, r.planningDate, now),
      daysToDue: r.nextDueAt ? daysUntilDue(r.nextDueAt, now) : null,
    };
  });
}
