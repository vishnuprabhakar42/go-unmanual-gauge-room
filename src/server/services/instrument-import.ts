import type { ColumnMapping } from "@/domain/import/mapping";
import { sequential } from "@/server/sequential";
import {
  normalizeKey,
  scopedKey,
  validateRows,
  type ImportContext,
  type ImportOptions,
  type NormalizedInstrument,
  type RawCell,
} from "@/domain/import/validate";
import { currentTenant, type TenantClient, type TenantTx } from "@/server/tenant";
import { newQrToken } from "./instruments";

type Reader = Pick<TenantClient, "instrumentType" | "instrument" | "plant" | "department" | "location">;

/** Loads everything validation needs (one query per master; fine at 20k instruments). */
export async function buildImportContext(db: Reader, defaultPlantId: string, options: ImportOptions): Promise<ImportContext> {
  const [plants, types, codes, departments, locations] = await sequential([
    db.plant.findMany({ where: { archivedAt: null }, select: { id: true, code: true } }),
    db.instrumentType.findMany({ where: { archivedAt: null } }),
    db.instrument.findMany({ select: { code: true } }),
    db.department.findMany({ where: { archivedAt: null }, select: { name: true, plant: { select: { code: true } } } }),
    db.location.findMany({ where: { archivedAt: null }, select: { name: true, plant: { select: { code: true } } } }),
  ]);
  const defaultPlant = plants.find((p) => p.id === defaultPlantId) ?? plants[0];
  if (!defaultPlant) throw new Error("No accessible plant");
  return {
    defaultPlantCode: defaultPlant.code,
    plantCodes: new Set(plants.map((p) => normalizeKey(p.code))),
    types: new Map(
      types.map((t) => [
        normalizeKey(t.name),
        {
          name: t.name,
          defaultFrequencyValue: t.defaultFrequencyValue,
          defaultFrequencyUnit: t.defaultFrequencyUnit,
          nablRequired: t.nablRequired,
          unit: t.unit,
        },
      ]),
    ),
    existingCodes: new Set(codes.map((c) => normalizeKey(c.code))),
    departments: new Set(departments.map((d) => scopedKey(d.plant.code, d.name))),
    locations: new Set(locations.map((l) => scopedKey(l.plant.code, l.name))),
    options,
    now: new Date(),
  };
}

export type ImportOutcome = {
  created: number;
  updated: number;
  skipped: number;
  typesCreated: number;
  departmentsCreated: number;
  locationsCreated: number;
};

const CHUNK = 500;

/**
 * Re-validates (never trusts the client's dry run) and writes valid rows. Rows with errors are skipped
 * and reported; nothing is overwritten unless options.updateExisting.
 */
export async function commitImport(
  tx: TenantTx,
  input: {
    rows: RawCell[][];
    mapping: ColumnMapping;
    firstDataRow: number;
    defaultPlantId: string;
    options: ImportOptions;
    fileName: string;
  },
): Promise<ImportOutcome> {
  const { organizationId, actorId } = currentTenant();
  const ctx = await buildImportContext(tx, input.defaultPlantId, input.options);
  const { results, summary } = validateRows(input.rows, input.mapping, ctx, input.firstDataRow);
  const valid = results.filter((r) => r.data).map((r) => ({ action: r.action, data: r.data as NormalizedInstrument }));

  const plants = new Map(
    (await tx.plant.findMany({ select: { id: true, code: true } })).map((p) => [normalizeKey(p.code), p.id]),
  );

  // 1. Missing instrument types (only when the user opted in)
  let typesCreated = 0;
  if (input.options.createMissingTypes && summary.missingTypes.length) {
    const firstRowByType = new Map<string, NormalizedInstrument>();
    for (const v of valid)
      if (!firstRowByType.has(normalizeKey(v.data.typeName))) firstRowByType.set(normalizeKey(v.data.typeName), v.data);
    const created = await tx.instrumentType.createManyAndReturn({
      data: summary.missingTypes.map((name) => {
        const sample = firstRowByType.get(normalizeKey(name));
        return {
          organizationId,
          name,
          unit: sample?.unit ?? null,
          defaultFrequencyValue: sample?.frequencyValue ?? 12,
          defaultFrequencyUnit: sample?.frequencyUnit ?? "MONTHS",
          nablRequired: sample?.nablRequired ?? true,
        };
      }),
      skipDuplicates: true,
    });
    typesCreated = created.length;
  }
  const typeIds = new Map(
    (await tx.instrumentType.findMany({ select: { id: true, name: true } })).map((t) => [normalizeKey(t.name), t.id]),
  );

  // 2. Departments / locations referenced by name, per plant
  const ensureNodes = async (kind: "department" | "location") => {
    const needed = new Map<string, { plantId: string; name: string }>();
    for (const { data } of valid) {
      const name = kind === "department" ? data.department : data.location;
      const plantId = plants.get(data.plantCode);
      if (name && plantId) needed.set(`${plantId}|${normalizeKey(name)}`, { plantId, name });
    }
    const existing =
      kind === "department"
        ? await tx.department.findMany({ select: { id: true, name: true, plantId: true } })
        : await tx.location.findMany({ select: { id: true, name: true, plantId: true } });
    const map = new Map(existing.map((n) => [`${n.plantId}|${normalizeKey(n.name)}`, n.id]));
    const missing = [...needed.entries()]
      .filter(([k]) => !map.has(k))
      .map(([, v]) => ({ organizationId, plantId: v.plantId, name: v.name }));
    if (missing.length) {
      const created =
        kind === "department"
          ? await tx.department.createManyAndReturn({ data: missing })
          : await tx.location.createManyAndReturn({ data: missing });
      for (const n of created) map.set(`${n.plantId}|${normalizeKey(n.name)}`, n.id);
    }
    return { map, created: missing.length };
  };
  const depts = await ensureNodes("department");
  const locs = await ensureNodes("location");

  const toRow = (d: NormalizedInstrument) => {
    const plantId = plants.get(d.plantCode)!;
    return {
      plantId,
      code: d.code,
      typeId: typeIds.get(normalizeKey(d.typeName))!,
      description: d.description,
      make: d.make,
      model: d.model,
      serialNo: d.serialNo,
      rangeMin: d.rangeMin,
      rangeMax: d.rangeMax,
      unit: d.unit,
      leastCount: d.leastCount,
      tolerancePlus: d.tolerancePlus,
      toleranceMinus: d.toleranceMinus,
      acceptanceCriteria: d.acceptanceCriteria,
      departmentId: d.department ? (depts.map.get(`${plantId}|${normalizeKey(d.department)}`) ?? null) : null,
      locationId: d.location ? (locs.map.get(`${plantId}|${normalizeKey(d.location)}`) ?? null) : null,
      custodianName: d.custodianName,
      criticality: d.criticality,
      calibrationSource: d.calibrationSource,
      frequencyValue: d.frequencyValue,
      frequencyUnit: d.frequencyUnit,
      lastCalibratedAt: d.lastCalibratedAt,
      nextDueAt: d.nextDueAt,
      nablRequired: d.nablRequired,
      purchaseValue: d.purchaseValue,
      status: d.status,
      notes: d.notes,
      standardCode: d.standardCode,
      standardDate: d.standardDate,
      adjustable: d.adjustable,
    };
  };

  // 3. Creates in chunks (audited in bulk by the tenant client), with CREATED events
  const creates = valid.filter((v) => v.action === "create");
  for (let i = 0; i < creates.length; i += CHUNK) {
    const chunk = creates.slice(i, i + CHUNK);
    const rows = await tx.instrument.createManyAndReturn({
      // full rows returned so the audit log captures complete "after" snapshots
      data: chunk.map((c) => ({ ...toRow(c.data), organizationId, qrToken: newQrToken() })),
    });
    await tx.instrumentEvent.createMany({
      data: rows.map((r) => ({
        organizationId,
        instrumentId: r.id,
        type: "CREATED" as const,
        actorId,
        payload: { source: "import", file: input.fileName },
      })),
    });
  }

  // 4. Updates (only when chosen): status is never overwritten by import — it must go through the state machine.
  const updates = valid.filter((v) => v.action === "update");
  for (const u of updates) {
    const existing = await tx.instrument.findFirst({
      where: { code: { equals: u.data.code, mode: "insensitive" } },
      select: { id: true },
    });
    if (!existing) continue;
    const { status: _status, ...row } = toRow(u.data);
    void _status;
    await tx.instrument.update({ where: { id: existing.id }, data: row });
    await tx.instrumentEvent.create({
      data: {
        organizationId,
        instrumentId: existing.id,
        type: "EDITED",
        actorId,
        payload: { source: "import", file: input.fileName },
      },
    });
  }

  return {
    created: creates.length,
    updated: updates.length,
    skipped: results.length - valid.length,
    typesCreated,
    departmentsCreated: depts.created,
    locationsCreated: locs.created,
  };
}
