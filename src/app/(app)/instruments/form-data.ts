import { formatDate, toDateInput } from "@/domain/india/format";
import { parseOrgSettings } from "@/domain/settings";
import type { InstrumentInput } from "@/domain/instrument-schemas";
import type { TenantClient } from "@/server/tenant";

export type FormOptions = {
  plants: { id: string; label: string }[];
  types: {
    id: string;
    name: string;
    defaultFrequencyValue: number;
    defaultFrequencyUnit: "DAYS" | "MONTHS";
    nablRequired: boolean;
    unit: string | null;
    defaultLeadTimeDays: number | null;
    standardCode: string | null;
    standardDate: string | null;
  }[];
  /** Org default "plan N days before due" */
  orgLeadDays: number;
  departments: { id: string; plantId: string; name: string }[];
  locations: { id: string; plantId: string; name: string }[];
};

export async function loadFormOptions(db: TenantClient): Promise<FormOptions> {
  const [org, plants, types, departments, locations] = await Promise.all([
    db.organization.findFirstOrThrow({ select: { settings: true } }),
    db.plant.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" } }),
    db.instrumentType.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    db.department.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, plantId: true, name: true },
    }),
    db.location.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, plantId: true, name: true, parent: { select: { name: true } } },
    }),
  ]);
  return {
    plants: plants.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })),
    types: types.map((t) => ({
      id: t.id,
      name: t.name,
      defaultFrequencyValue: t.defaultFrequencyValue,
      defaultFrequencyUnit: t.defaultFrequencyUnit,
      nablRequired: t.nablRequired,
      unit: t.unit,
      defaultLeadTimeDays: t.defaultLeadTimeDays,
      standardCode: t.standardCode,
      standardDate: t.standardDate ? formatDate(t.standardDate) : null,
    })),
    orgLeadDays: parseOrgSettings(org.settings).dueSoonDays,
    departments,
    locations: locations.map((l) => ({ id: l.id, plantId: l.plantId, name: l.parent ? `${l.parent.name} › ${l.name}` : l.name })),
  };
}

type Dec = { toNumber(): number } | null;
const num = (d: Dec) => (d == null ? "" : String(d.toNumber()));

/** DB row → form defaults (strings for inputs). */
export function instrumentToForm(i: {
  plantId: string;
  code: string;
  typeId: string;
  description: string | null;
  make: string | null;
  model: string | null;
  serialNo: string | null;
  rangeMin: Dec;
  rangeMax: Dec;
  unit: string | null;
  leastCount: Dec;
  tolerancePlus: Dec;
  toleranceMinus: Dec;
  acceptanceCriteria: string | null;
  departmentId: string | null;
  locationId: string | null;
  custodianName: string | null;
  criticality: "A" | "B" | "C";
  calibrationSource: "EXTERNAL" | "INHOUSE";
  frequencyValue: number;
  frequencyUnit: "DAYS" | "MONTHS";
  lastCalibratedAt: Date | null;
  nextDueAt: Date | null;
  nablRequired: boolean;
  purchaseValue: Dec;
  notes: string | null;
  planLeadDays: number | null;
  standardCode: string | null;
  standardDate: Date | null;
  adjustable: boolean | null;
}): InstrumentInput {
  return {
    plantId: i.plantId,
    code: i.code,
    typeId: i.typeId,
    description: i.description ?? "",
    make: i.make ?? "",
    model: i.model ?? "",
    serialNo: i.serialNo ?? "",
    rangeMin: num(i.rangeMin),
    rangeMax: num(i.rangeMax),
    unit: i.unit ?? "",
    leastCount: num(i.leastCount),
    tolerancePlus: num(i.tolerancePlus),
    toleranceMinus: num(i.toleranceMinus),
    acceptanceCriteria: i.acceptanceCriteria ?? "",
    departmentId: i.departmentId ?? "",
    locationId: i.locationId ?? "",
    custodianName: i.custodianName ?? "",
    criticality: i.criticality,
    calibrationSource: i.calibrationSource,
    frequencyValue: i.frequencyValue,
    frequencyUnit: i.frequencyUnit,
    lastCalibratedAt: toDateInput(i.lastCalibratedAt),
    nextDueAt: toDateInput(i.nextDueAt),
    nablRequired: i.nablRequired,
    purchaseValue: num(i.purchaseValue),
    notes: i.notes ?? "",
    planLeadDays: i.planLeadDays == null ? "" : String(i.planLeadDays),
    standardCode: i.standardCode ?? "",
    standardDate: toDateInput(i.standardDate),
    adjustable: i.adjustable == null ? "" : i.adjustable ? "ADJUSTABLE" : "NON_ADJUSTABLE",
  };
}
