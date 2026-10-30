import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/server/db";
import { changeRequestStatus, createRequestsFromSelection, removeRequestItem } from "@/server/services/calibration-requests";
import { runOrgDigest } from "@/server/services/digest";
import { dashboardStats, loadDueConfig } from "@/server/services/due-planning";
import { changeInstrumentStatus, createInstrument, listInstruments, updateInstrument } from "@/server/services/instruments";
import { createInstrumentType } from "@/server/services/masters";
import { tenantDb, withTenantTx, type TenantContext } from "@/server/tenant";
import { makeOrg } from "./helpers";

const DAY = 86_400_000;

async function setup(name: string) {
  const org = await makeOrg(name, ["PLT1", "PLT2"]);
  const [vernier, plug] = await withTenantTx(org.ctx, async (tx) => [
    await createInstrumentType(tx, {
      name: "Vernier",
      category: "DIMENSIONAL",
      defaultFrequencyValue: 12,
      defaultFrequencyUnit: "MONTHS",
      nablRequired: true,
      defaultLeadTimeDays: null,
    }),
    await createInstrumentType(tx, {
      name: "Plug Gauge",
      category: "DIMENSIONAL",
      defaultFrequencyValue: 12,
      defaultFrequencyUnit: "MONTHS",
      nablRequired: true,
      defaultLeadTimeDays: 10,
    }),
  ]);
  const add = (code: string, plantIdx: number, typeId: string, nextDueInDays: number | null) =>
    withTenantTx(org.ctx, (tx) =>
      createInstrument(tx, {
        plantId: org.plants[plantIdx].id,
        code,
        typeId,
        criticality: "B",
        calibrationSource: "EXTERNAL",
        frequencyValue: 12,
        frequencyUnit: "MONTHS",
        nablRequired: true,
        lastCalibratedAt: null,
        nextDueAt: nextDueInDays === null ? null : new Date(Date.now() + nextDueInDays * DAY),
      }),
    );
  return { ...org, vernier, plug, add };
}

describe("due list with per-type windows", () => {
  it("applies the type's lead time instead of the org window", async () => {
    const o = await setup("Lead Org");
    await o.add("V-20", 0, o.vernier.id, 20); // org window 30 → due soon
    await o.add("P-20", 0, o.plug.id, 20); // plug window 10 → not yet
    await o.add("P-5", 0, o.plug.id, 5); // due soon
    const db = tenantDb(o.ctx);
    const due = await loadDueConfig(db);
    const codes = async (d: "DUE_SOON" | "ACTION" | "OK") =>
      (await listInstruments(db, { filters: { due: d }, due, page: 1, pageSize: 50, sort: "code", dir: "asc" })).rows.map(
        (r) => r.code,
      );
    expect(await codes("DUE_SOON")).toEqual(["P-5", "V-20"]);
    expect(await codes("OK")).toEqual(["P-20"]);
  });
});

describe("calibration requests from selection", () => {
  it("creates one numbered draft per plant and skips instruments already requested", async () => {
    const o = await setup("Request Org");
    const a = await o.add("A", 0, o.vernier.id, -5);
    const b = await o.add("B", 0, o.vernier.id, 3);
    const c = await o.add("C", 1, o.vernier.id, 10);
    const lost = await o.add("L", 0, o.vernier.id, 1);
    await withTenantTx(o.ctx, (tx) => changeInstrumentStatus(tx, lost.id, "LOST", "Missing"));

    const first = await withTenantTx(o.ctx, (tx) => createRequestsFromSelection(tx, [a.id, b.id, c.id, lost.id]));
    expect(first.requests.map((r) => [r.number, r.items]).sort()).toEqual([
      [expect.stringMatching(/^CR\/PLT1\/\d\d-\d\d\/0001$/), 2],
      [expect.stringMatching(/^CR\/PLT2\/\d\d-\d\d\/0001$/), 1],
    ]);
    expect(first.skipped).toEqual([{ code: "L", reason: "Status is LOST" }]);

    const again = await withTenantTx(o.ctx, (tx) => createRequestsFromSelection(tx, [a.id]));
    expect(again.requests).toEqual([]);
    expect(again.skipped[0].reason).toMatch(/Already on CR\/PLT1/);

    // Not-in-open-request filter hides them from the due list
    const db = tenantDb(o.ctx);
    const due = await loadDueConfig(db);
    const listed = await listInstruments(db, {
      filters: { due: "ACTION", notInOpenRequest: true },
      due,
      page: 1,
      pageSize: 50,
      sort: "code",
      dir: "asc",
    });
    expect(listed.rows.map((r) => r.code)).toEqual([]);

    // Removing an item frees the instrument; cancelling frees the rest
    const plt1 = first.requests.find((r) => r.plantCode === "PLT1")!;
    const itemA = await db.calibrationRequestItem.findFirstOrThrow({ where: { requestId: plt1.id, instrumentId: a.id } });
    await withTenantTx(o.ctx, (tx) => removeRequestItem(tx, itemA.id));
    await withTenantTx(o.ctx, (tx) =>
      changeRequestStatus(tx, first.requests.find((r) => r.plantCode === "PLT2")!.id, "CANCELLED"),
    );
    const free = await listInstruments(db, {
      filters: { due: "ACTION", notInOpenRequest: true },
      due,
      page: 1,
      pageSize: 50,
      sort: "code",
      dir: "asc",
    });
    expect(free.rows.map((r) => r.code)).toEqual(["A", "C"]);

    await expect(withTenantTx(o.ctx, (tx) => changeRequestStatus(tx, plt1.id, "APPROVED"))).rejects.toThrow(
      /Cannot move request/,
    );
    const audit = await db.auditLog.count({ where: { entity: "CalibrationRequest" } });
    expect(audit).toBeGreaterThanOrEqual(3);
  });

  it("plant-limited users can't put another plant's instruments on a request", async () => {
    const o = await setup("Scoped Request Org");
    const other = await o.add("X", 1, o.vernier.id, 1);
    const limited: TenantContext = { ...o.ctx, plantIds: [o.plants[0].id] };
    const res = await withTenantTx(limited, (tx) => createRequestsFromSelection(tx, [other.id]));
    expect(res.requests).toEqual([]);
    expect(res.skipped[0].reason).toMatch(/Not found/);
  });
});

describe("dashboard", () => {
  it("counts update immediately when the last calibration date changes", async () => {
    const o = await setup("Dash Org");
    const inst = await o.add("D1", 0, o.vernier.id, -10);
    const db = tenantDb(o.ctx);
    const before = await dashboardStats(db, await loadDueConfig(db), null);
    expect(before.overdue).toBe(1);
    expect(before.overdueByDepartment[0].count).toBe(1);

    await withTenantTx(o.ctx, (tx) =>
      updateInstrument(tx, inst.id, {
        plantId: o.plants[0].id,
        code: "D1",
        typeId: o.vernier.id,
        criticality: "B",
        calibrationSource: "EXTERNAL",
        frequencyValue: 12,
        frequencyUnit: "MONTHS",
        nablRequired: true,
        lastCalibratedAt: new Date(Date.now() - 2 * DAY),
      }),
    );
    const after = await dashboardStats(db, await loadDueConfig(db), null);
    expect(after.overdue).toBe(0);
    expect(after.dueByMonth.reduce((n, m) => n + m.count, 0)).toBe(0); // due in ~12 months, beyond the 6-month chart
  });

  it("buckets instruments at vendor by days since dispatch", async () => {
    const o = await setup("Aging Org");
    const ids = await Promise.all(["V1", "V2", "V3"].map((c) => o.add(c, 0, o.vernier.id, 30)));
    for (const i of ids) {
      await withTenantTx(o.ctx, async (tx) => {
        await changeInstrumentStatus(tx, i.id, "AWAITING_DISPATCH");
        await changeInstrumentStatus(tx, i.id, "AT_VENDOR");
      });
    }
    await prisma.instrument.update({ where: { id: ids[1].id }, data: { statusChangedAt: new Date(Date.now() - 20 * DAY) } });
    await prisma.instrument.update({ where: { id: ids[2].id }, data: { statusChangedAt: new Date(Date.now() - 45 * DAY) } });
    const db = tenantDb(o.ctx);
    const stats = await dashboardStats(db, await loadDueConfig(db), null);
    expect(stats.atVendor).toBe(3);
    expect(stats.aging).toEqual({ "0-15": 1, "16-30": 1, "30+": 1 });
  });
});

describe("daily digest", () => {
  it("sends plant-scoped digests, escalates to the quality head, skips empty ones, and is idempotent", async () => {
    const o = await setup("Digest Org");
    const mkUser = async (role: "GAUGE_INCHARGE" | "QUALITY_HEAD", plantId: string | null, phone?: string) =>
      withTenantTx(o.ctx, async (tx) => {
        const u = await tx.user.create({ data: { email: `${createId()}@digest.test`, name: role, phone: phone ?? null } });
        await tx.membership.create({ data: { organizationId: o.organizationId, userId: u.id, role, plantId } });
        return u;
      });
    const g1 = await mkUser("GAUGE_INCHARGE", o.plants[0].id, "919800000010");
    const g2 = await mkUser("GAUGE_INCHARGE", o.plants[1].id);
    const qh = await mkUser("QUALITY_HEAD", null);
    await o.add("OVER-10", 0, o.vernier.id, -10);
    await o.add("OVER-2", 0, o.vernier.id, -2);
    await o.add("WEEK-3", 0, o.vernier.id, 3);
    // plant 2 has nothing due → g2 gets no digest

    const res = await runOrgDigest(o.organizationId);
    // recipients: g1, g2, qh (org admin is not a recipient because a quality head exists)
    expect(res).toEqual({ recipients: 3, sent: 2, skippedEmpty: 1, skippedAlreadySent: 0 });

    const db = tenantDb(o.ctx);
    const notes = await db.notification.findMany({ where: { template: "digest.daily" } });
    const forUser = (id: string) => notes.filter((n) => n.userId === id);
    expect(
      forUser(g1.id)
        .map((n) => n.channel)
        .sort(),
    ).toEqual(["EMAIL", "WHATSAPP"]);
    expect(forUser(g2.id)).toHaveLength(0);
    const qhPayload = forUser(qh.id)[0].payload as { counts: Record<string, number>; escalated: { code: string }[] };
    expect(qhPayload.counts).toEqual({ overdue: 2, dueThisWeek: 1, returnsOverdue: 0, escalated: 1 });
    expect(qhPayload.escalated.map((e) => e.code)).toEqual(["OVER-10"]);
    const g1Payload = forUser(g1.id)[0].payload as { counts: Record<string, number> };
    expect(g1Payload.counts.escalated).toBe(0);

    const again = await runOrgDigest(o.organizationId);
    expect(again.sent).toBe(0);
    expect(again.skippedAlreadySent).toBe(2);
  });
});
