import { describe, expect, it } from "vitest";
import { formatDate } from "@/domain/india/format";
import { detectHeaderRow, suggestMapping } from "@/domain/import/mapping";
import { prisma } from "@/server/db";
import { commitImport } from "@/server/services/instrument-import";
import { changeInstrumentStatus, createInstrument, listInstruments, updateInstrument } from "@/server/services/instruments";
import { createInstrumentType } from "@/server/services/masters";
import { parseSpreadsheet } from "@/server/services/spreadsheet";
import { tenantDb, withTenantTx } from "@/server/tenant";
import { buildMessyRegister } from "../../scripts/fixtures/messy-register";
import { makeOrg } from "./helpers";

async function setupOrg(name: string) {
  const org = await makeOrg(name, ["PLT1"]);
  const type = await withTenantTx(org.ctx, (tx) =>
    createInstrumentType(tx, {
      name: "Vernier Caliper",
      category: "DIMENSIONAL",
      parameter: "Length",
      unit: "mm",
      defaultFrequencyValue: 12,
      defaultFrequencyUnit: "MONTHS",
      defaultTolerance: "±0.02 mm",
      nablRequired: true,
      hsnCode: "9017",
      defaultLeadTimeDays: null,
    }),
  );
  return { ...org, type };
}

const baseInput = (plantId: string, typeId: string, code: string) => ({
  plantId,
  code,
  typeId,
  criticality: "B" as const,
  calibrationSource: "EXTERNAL" as const,
  frequencyValue: 12,
  frequencyUnit: "MONTHS" as const,
  nablRequired: true,
  lastCalibratedAt: new Date("2025-11-14T18:30:00Z"), // 15-11-2025 IST
});

describe("instruments", () => {
  it("derives next due from last calibration and recomputes it on edit", async () => {
    const org = await setupOrg("Inst Org");
    const created = await withTenantTx(org.ctx, (tx) => createInstrument(tx, baseInput(org.plants[0].id, org.type.id, "VC-1")));
    expect(formatDate(created.nextDueAt)).toBe("15-11-2026");
    expect(created.qrToken).toMatch(/^[0-9A-Za-z]{12}$/);

    const updated = await withTenantTx(org.ctx, (tx) =>
      updateInstrument(tx, created.id, {
        ...baseInput(org.plants[0].id, org.type.id, "VC-1"),
        lastCalibratedAt: new Date("2026-01-09T18:30:00Z"),
        frequencyValue: 6,
      }),
    );
    expect(formatDate(updated.nextDueAt)).toBe("10-07-2026");

    const events = await tenantDb(org.ctx).instrumentEvent.findMany({
      where: { instrumentId: created.id },
      orderBy: { at: "asc" },
    });
    expect(events.map((e) => e.type)).toEqual(["CREATED", "EDITED"]);
    expect((events[1].payload as { fields: string[] }).fields).toEqual(
      expect.arrayContaining(["lastCalibratedAt", "nextDueAt", "frequencyValue"]),
    );
  });

  it("changes status only through the state machine and logs it", async () => {
    const org = await setupOrg("Status Org");
    const inst = await withTenantTx(org.ctx, (tx) => createInstrument(tx, baseInput(org.plants[0].id, org.type.id, "VC-2")));
    await withTenantTx(org.ctx, (tx) => changeInstrumentStatus(tx, inst.id, "IN_USE"));
    await expect(withTenantTx(org.ctx, (tx) => changeInstrumentStatus(tx, inst.id, "AT_VENDOR"))).rejects.toThrow(
      /Cannot change status/,
    );
    await expect(withTenantTx(org.ctx, (tx) => changeInstrumentStatus(tx, inst.id, "LOST"))).rejects.toThrow(/reason/);
    await withTenantTx(org.ctx, (tx) => changeInstrumentStatus(tx, inst.id, "LOST", "Missing after shift audit"));
    const audit = await tenantDb(org.ctx).auditLog.findMany({
      where: { entity: "Instrument", entityId: inst.id, action: "STATUS_CHANGE" },
    });
    expect(audit).toHaveLength(2);
    // instrument events are append-only
    await expect(withTenantTx(org.ctx, (tx) => tx.instrumentEvent.updateMany({ data: { type: "EDITED" } }))).rejects.toThrow(
      /append-only/,
    );
  });

  it("rejects duplicate codes per org but allows the same code in another org", async () => {
    const a = await setupOrg("Dup A");
    const b = await setupOrg("Dup B");
    await withTenantTx(a.ctx, (tx) => createInstrument(tx, baseInput(a.plants[0].id, a.type.id, "SAME-1")));
    await expect(
      withTenantTx(a.ctx, (tx) => createInstrument(tx, baseInput(a.plants[0].id, a.type.id, "same-1"))),
    ).rejects.toThrow(/already used/);
    await expect(
      withTenantTx(b.ctx, (tx) => createInstrument(tx, baseInput(b.plants[0].id, b.type.id, "SAME-1"))),
    ).resolves.toBeDefined();
    // and lists are org-scoped
    const { total } = await listInstruments(tenantDb(a.ctx), {
      filters: {},
      due: { orgDays: 30, typeLeads: [] },
      page: 1,
      pageSize: 50,
      sort: "code",
      dir: "asc",
    });
    expect(total).toBe(1);
  });

  it("filters by due state", async () => {
    const org = await setupOrg("Due Org");
    const now = Date.now();
    const daysAgo = (n: number) => new Date(now - n * 86_400_000);
    await withTenantTx(org.ctx, async (tx) => {
      await createInstrument(tx, { ...baseInput(org.plants[0].id, org.type.id, "OVER"), lastCalibratedAt: daysAgo(400) });
      await createInstrument(tx, { ...baseInput(org.plants[0].id, org.type.id, "SOON"), lastCalibratedAt: daysAgo(350) });
      await createInstrument(tx, { ...baseInput(org.plants[0].id, org.type.id, "OK"), lastCalibratedAt: daysAgo(10) });
      await createInstrument(tx, { ...baseInput(org.plants[0].id, org.type.id, "NONE"), lastCalibratedAt: null });
    });
    const codes = async (due: "OVERDUE" | "DUE_SOON" | "OK" | "NOT_SCHEDULED") =>
      (
        await listInstruments(tenantDb(org.ctx), {
          filters: { due },
          due: { orgDays: 30, typeLeads: [] },
          page: 1,
          pageSize: 50,
          sort: "code",
          dir: "asc",
        })
      ).rows.map((r) => r.code);
    expect(await codes("OVERDUE")).toEqual(["OVER"]);
    expect(await codes("DUE_SOON")).toEqual(["SOON"]);
    expect(await codes("OK")).toEqual(["OK"]);
    expect(await codes("NOT_SCHEDULED")).toEqual(["NONE"]);
  });
});

describe("Excel import", () => {
  it("imports a 2,000-row messy sheet with a clear error report in under 30 s", async () => {
    const org = await makeOrg("Import Org", ["PLT1"]);
    const buffer = await buildMessyRegister({ rows: 2000 });
    const started = Date.now();

    const sheet = await parseSpreadsheet(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      "register.xlsx",
    );
    const headerRow = detectHeaderRow(sheet.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))));
    expect(headerRow).toBe(1);
    const { mapping } = suggestMapping(sheet.rows[headerRow].map((c) => String(c ?? "")));
    expect(mapping).toMatchObject({ code: 1, type: 2, range: 5, frequency: 9, lastCalibratedAt: 10 });

    const outcome = await withTenantTx(org.ctx, (tx) =>
      commitImport(tx, {
        rows: sheet.rows.slice(headerRow + 1),
        mapping,
        firstDataRow: headerRow + 2,
        defaultPlantId: org.plants[0].id,
        options: { createMissingTypes: true, updateExisting: false },
        fileName: "register.xlsx",
      }),
    );
    const elapsed = Date.now() - started;
    console.info(`[import] 2,000 rows in ${elapsed} ms`);
    expect(elapsed).toBeLessThan(30_000);

    // 2000 good rows + "new type" row; missing code, bad date, duplicate are skipped
    expect(outcome.created).toBe(2001);
    expect(outcome.skipped).toBe(3);
    expect(outcome.typesCreated).toBe(9); // 8 types + Bore Gauge
    expect(outcome.departmentsCreated).toBe(4);

    const db = tenantDb(org.ctx);
    expect(await db.instrument.count()).toBe(2001);
    expect(await db.instrument.count({ where: { nextDueAt: null } })).toBe(0);
    expect(await db.instrumentEvent.count({ where: { type: "CREATED" } })).toBe(2001);
    expect(await db.auditLog.count({ where: { entity: "Instrument", action: "CREATE" } })).toBe(2001);
    const sample = await db.instrument.findFirstOrThrow({ where: { code: "GR-00001" }, include: { type: true } });
    expect(sample.rangeMax?.toNumber()).toBeGreaterThan(0);
  }, 60_000);

  it("flags existing codes unless 'update existing' is chosen", async () => {
    const org = await makeOrg("Reimport Org", ["PLT1"]);
    const buffer = await buildMessyRegister({ rows: 20, brokenRows: false });
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const sheet = await parseSpreadsheet(ab, "r.xlsx");
    const { mapping } = suggestMapping(sheet.rows[1].map((c) => String(c ?? "")));
    const run = (updateExisting: boolean) =>
      withTenantTx(org.ctx, (tx) =>
        commitImport(tx, {
          rows: sheet.rows.slice(2),
          mapping,
          firstDataRow: 3,
          defaultPlantId: org.plants[0].id,
          options: { createMissingTypes: true, updateExisting },
          fileName: "r.xlsx",
        }),
      );
    expect((await run(false)).created).toBe(20);
    const second = await run(false);
    expect(second).toMatchObject({ created: 0, updated: 0, skipped: 20 });
    const third = await run(true);
    expect(third).toMatchObject({ created: 0, updated: 20 });
    expect(await prisma.instrument.count({ where: { organizationId: org.organizationId } })).toBe(20);
  }, 60_000);
});
