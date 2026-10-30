import { describe, expect, it } from "vitest";
import { startOfIstDay } from "@/domain/due";
import { prisma } from "@/server/db";
import { calibrationHistory } from "@/server/services/calibration-history";
import { createInstrument, instrumentWhere, updateInstrument } from "@/server/services/instruments";
import { loadDueConfig } from "@/server/services/due-planning";
import { createInstrumentType, updateInstrumentType } from "@/server/services/masters";
import { tenantDb, withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

const DAY = 86_400_000;
const today = () => startOfIstDay(new Date());

async function setup(name: string) {
  const org = await makeOrg(name, ["PLT1"]);
  const tx = <T>(fn: Parameters<typeof withTenantTx<T>>[1]) => withTenantTx(org.ctx, fn);
  const type = await tx((t) =>
    createInstrumentType(t, {
      name: "Micrometer",
      category: "DIMENSIONAL",
      defaultFrequencyValue: 12,
      defaultFrequencyUnit: "MONTHS",
      nablRequired: true,
      defaultLeadTimeDays: 20,
      standardCode: "ISO 3611",
      standardDate: new Date("2010-01-01T00:00:00+05:30"),
    }),
  );
  const base = {
    plantId: org.plants[0].id,
    typeId: type.id,
    criticality: "B" as const,
    calibrationSource: "EXTERNAL" as const,
    frequencyValue: 12,
    frequencyUnit: "MONTHS" as const,
    nablRequired: true,
  };
  return { org, tx, type, base, db: tenantDb(org.ctx) };
}

describe("planning date (DB-maintained)", () => {
  it("follows instrument override → type lead → org default, and recomputes when any changes", async () => {
    const s = await setup("Planning Org");
    const due = new Date(today().getTime() + 25 * DAY);
    const a = await s.tx((t) => createInstrument(t, { ...s.base, code: "MM-1", nextDueAt: due }));
    const planning = async (id: string) => (await s.db.instrument.findUniqueOrThrow({ where: { id } })).planningDate!.getTime();
    expect(await planning(a.id)).toBe(due.getTime() - 20 * DAY); // type lead

    await s.tx((t) => updateInstrument(t, a.id, { ...s.base, code: "MM-1", nextDueAt: due, planLeadDays: 30 }));
    expect(await planning(a.id)).toBe(due.getTime() - 30 * DAY); // instrument override

    // due filters honour the override: 30-day lead + due in 25 days → due soon
    const cfg = await loadDueConfig(s.db);
    expect(await s.db.instrument.count({ where: instrumentWhere({ due: "DUE_SOON" }, cfg) })).toBe(1);

    const b = await s.tx((t) => createInstrument(t, { ...s.base, code: "MM-2", nextDueAt: due }));
    await s.tx((t) =>
      updateInstrumentType(t, s.type.id, {
        name: "Micrometer",
        category: "DIMENSIONAL",
        defaultFrequencyValue: 12,
        defaultFrequencyUnit: "MONTHS",
        nablRequired: true,
        defaultLeadTimeDays: null,
      }),
    );
    expect(await planning(b.id)).toBe(due.getTime() - 30 * DAY); // org default (dueSoonDays 30)
    expect(await planning(a.id)).toBe(due.getTime() - 30 * DAY); // override unaffected

    await prisma.organization.update({ where: { id: s.org.organizationId }, data: { settings: { dueSoonDays: 10 } } });
    expect(await planning(b.id)).toBe(due.getTime() - 10 * DAY);
    expect(await s.db.instrument.count({ where: instrumentWhere({ due: "OK" }, cfg) })).toBe(1); // MM-2 now plans later
  });
});

describe("standards, adjustable and calibration history", () => {
  it("stores the new master fields and builds a complete history with cost", async () => {
    const s = await setup("History Org");
    const inst = await s.tx((t) =>
      createInstrument(t, {
        ...s.base,
        code: "MM-9",
        make: "Mitutoyo",
        leastCount: 0.001,
        adjustable: true,
        standardCode: "IS 2967",
        lastCalibratedAt: new Date(today().getTime() - 400 * DAY),
      }),
    );
    const row = await s.db.instrument.findUniqueOrThrow({ where: { id: inst.id } });
    expect(row).toMatchObject({ adjustable: true, standardCode: "IS 2967", make: "Mitutoyo" });
    const events = await s.db.instrumentEvent.findMany({ where: { instrumentId: inst.id } });
    expect(events.length).toBeGreaterThan(0);

    const vendorId = (
      await prisma.vendor.create({
        data: {
          ownerOrganizationId: s.org.organizationId,
          name: "Hist Lab",
          nablCertNo: "CC-7",
          links: { create: { organizationId: s.org.organizationId, isApproved: true } },
        },
      })
    ).id;
    const calibratedAt = new Date(today().getTime() - 30 * DAY);
    await s.tx(async (t) => {
      const po = await t.purchaseOrder.create({
        data: {
          organizationId: s.org.organizationId,
          plantId: s.base.plantId,
          vendorId,
          number: "PO/H/1",
          source: "RATE_CONTRACT",
          status: "CLOSED",
          subtotal: 500,
          gstAmount: 90,
          total: 590,
          sentAt: new Date(calibratedAt.getTime() - 5 * DAY),
        },
      });
      const item = await t.purchaseOrderItem.create({
        data: {
          organizationId: s.org.organizationId,
          poId: po.id,
          instrumentId: inst.id,
          description: "MM-9",
          rate: 500,
          gstPercent: 18,
          tatDays: 7,
        },
      });
      await t.calibrationJob.create({
        data: {
          organizationId: s.org.organizationId,
          plantId: s.base.plantId,
          instrumentId: inst.id,
          vendorId,
          poItemId: item.id,
          status: "CLOSED",
          sentAt: new Date(calibratedAt.getTime() - 3 * DAY),
          receivedAt: new Date(calibratedAt.getTime() + 2 * DAY),
          calibratedAt,
          certificateNo: "HL/1",
          result: "PASS",
          verifiedById: s.org.actor.id,
          verifiedAt: calibratedAt,
          standardCode: "IS 2967",
        },
      });
    });
    const h = (await calibrationHistory(s.db, inst.id))!;
    expect(h.entries).toHaveLength(2); // the job + the register's older date (manual)
    expect(h.entries[0]).toMatchObject({
      lab: "Hist Lab",
      certificateNo: "HL/1",
      result: "PASS",
      tatDays: 5,
      promisedTatDays: 7,
      standardCode: "IS 2967",
      verifiedBy: `History Org admin`,
    });
    expect(h.entries[0].cost).toEqual({ rate: 500, gstPercent: 18, gst: 90, total: 590 });
    expect(h.entries[1].manual).toBe(true);
    expect(h.summary).toMatchObject({ calibrations: 2, passed: 1, failed: 0, totalCost: 590, avgTatDays: 5 });

    const other = await makeOrg("History Org B");
    expect(await calibrationHistory(tenantDb(other.ctx), inst.id)).toBeNull();
  });
});
