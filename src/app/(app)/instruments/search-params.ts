import { isMonthKey } from "@/domain/due";
import { INSTRUMENT_STATUSES, type InstrumentStatus } from "@/domain/instrument-status";
import { INSTRUMENT_SORTS, type InstrumentFilters, type InstrumentSort } from "@/server/services/instruments";

export type InstrumentSearchParams = Record<string, string | undefined>;

const DUE = ["OVERDUE", "DUE_SOON", "OK", "NOT_SCHEDULED", "ACTION"] as const;

/** URL → validated filters (shared by the list page and the Excel export route). */
export function parseInstrumentParams(sp: InstrumentSearchParams, currentPlantId: string | null) {
  const filters: InstrumentFilters = {
    q: sp.q?.slice(0, 100),
    plantId: currentPlantId,
    status: INSTRUMENT_STATUSES.includes(sp.status as InstrumentStatus) ? (sp.status as InstrumentStatus) : undefined,
    typeId: sp.type || undefined,
    departmentId: sp.dept || undefined,
    criticality: sp.crit === "A" || sp.crit === "B" || sp.crit === "C" ? sp.crit : undefined,
    due: DUE.includes(sp.due as (typeof DUE)[number]) ? (sp.due as (typeof DUE)[number]) : undefined,
    month: isMonthKey(sp.month) ? sp.month : undefined,
    notInOpenRequest: sp.open === "0",
    archived: sp.archived === "1",
  };
  const sort: InstrumentSort = INSTRUMENT_SORTS.includes(sp.sort as InstrumentSort) ? (sp.sort as InstrumentSort) : "nextDueAt";
  const dir: "asc" | "desc" = sp.dir === "desc" || (sp.dir !== "asc" && sort === "updatedAt") ? "desc" : "asc";
  return { filters, sort, dir };
}
