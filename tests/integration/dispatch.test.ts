import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { runOrgDigest } from "@/server/services/digest";
import {
  cancelChallan,
  challanCandidates,
  createChallan,
  dispatchChallan,
  issueChallan,
  overdueReturns,
  receiveByScan,
  receiveItems,
} from "@/server/services/challans";
import { dashboardStats, loadDueConfig } from "@/server/services/due-planning";
import { createInstrument } from "@/server/services/instruments";
import { createInstrumentType } from "@/server/services/masters";
import { approvePurchaseOrder, createPurchaseOrder } from "@/server/services/purchase-orders";
import { createVendor } from "@/server/services/vendors";
import { tenantDb, withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

async function setup(name: string, count: number) {
  const org = await makeOrg(name, ["PLT1"]);
  const tx = <T>(fn: Parameters<typeof withTenantTx<T>>[1]) => withTenantTx(org.ctx, fn);
  const type = await tx((t) =>
    createInstrumentType(t, {
      name: "Vernier",
      category: "DIMENSIONAL",
      defaultFrequencyValue: 12,
      defaultFrequencyUnit: "MONTHS",
      nablRequired: true,
      hsnCode: "9017",
    }),
  );
  const vendor = await tx((t) =>
    createVendor(t, {
      name: "Cal Lab",
      gstin: null,
      pan: null,
      address: "Pune",
      stateCode: "27",
      contacts: [],
      accreditationType: "NABL",
      nablCertNo: "CC-1",
      nablValidUntil: new Date(Date.now() + 300 * 86_400_000),
      onsiteCapable: false,
      isApproved: true,
      evaluationNotes: null,
    }),
  );
  const instruments: Awaited<ReturnType<typeof createInstrument>>[] = [];
  for (let i = 1; i <= count; i++) {
    instruments.push(
      await tx((t) =>
        createInstrument(t, {
          plantId: org.plants[0].id,
          code: `VC-${String(i).padStart(2, "0")}`,
          typeId: type.id,
          criticality: "B",
          calibrationSource: "EXTERNAL",
          frequencyValue: 12,
          frequencyUnit: "MONTHS",
          nablRequired: true,
          purchaseValue: 2500,
          nextDueAt: new Date(Date.now() + 5 * 86_400_000),
        }),
      ),
    );
  }
  const po = await tx((t) =>
    createPurchaseOrder(t, {
      plantId: org.plants[0].id,
      vendorId: vendor.id,
      requestId: null,
      rfqId: null,
      source: "RATE_CONTRACT",
      lines: instruments.map((i) => ({
        instrumentId: i.id,
        requestItemId: null,
        description: `Calibration of ${i.code}`,
        rate: 450,
        gstPercent: 18,
        tatDays: 7,
      })),
    }),
  );
  await tx((t) => approvePurchaseOrder(t, po.id));
  return { org, tx, po, instruments, vendor };
}

async function challanFor(s: Awaited<ReturnType<typeof setup>>) {
  const { items } = await challanCandidates(tenantDb(s.org.ctx), s.po.id);
  const challan = await s.tx((t) =>
    createChallan(t, {
      poId: s.po.id,
      lines: items.map((i) => ({ poItemId: i.poItemId, value: i.value!, hsnCode: i.hsnCode, description: i.description })),
    }),
  );
  return challan;
}

describe("M4 acceptance: partial returns", () => {
  it("12-item challan with 7 returned → PARTIALLY_RETURNED, 5 pending in at-vendor aging", async () => {
    const s = await setup("Dispatch Org", 12);
    const db = tenantDb(s.org.ctx);
    expect(await db.calibrationJob.count({ where: { status: "PO_RAISED" } })).toBe(12); // created on PO approval

    const challan = await challanFor(s);
    expect(challan.number).toBeNull(); // numbered on issue
    const number = await s.tx((t) => issueChallan(t, challan.id));
    expect(number).toMatch(/^DCPLT1\/\d{4}\/\d{4}$/);
    expect(number.length).toBeLessThanOrEqual(16);
    expect(await db.instrument.count({ where: { status: "AWAITING_DISPATCH" } })).toBe(12);

    const { gatePassNo } = await s.tx((t) =>
      dispatchChallan(t, challan.id, { transportMode: "VEHICLE", vehicleNo: "mh 14 ab 1234", ewayBillNo: null }),
    );
    expect(gatePassNo).toMatch(/^GP\/PLT1\//);
    expect(await db.instrument.count({ where: { status: "AT_VENDOR" } })).toBe(12);
    expect(await db.calibrationJob.count({ where: { status: "DISPATCHED", sentAt: { not: null } } })).toBe(12);
    expect(await db.instrumentEvent.count({ where: { type: "SENT" } })).toBe(12);

    const items = await db.deliveryChallanItem.findMany({ where: { challanId: challan.id }, orderBy: { createdAt: "asc" } });
    const res = await s.tx((t) =>
      receiveItems(
        t,
        challan.id,
        items.slice(0, 7).map((i) => i.id),
        "OK, sealed",
      ),
    );
    expect(res).toEqual({ received: 7, status: "PARTIALLY_RETURNED" });

    const after = await db.deliveryChallan.findUniqueOrThrow({ where: { id: challan.id } });
    expect(after.status).toBe("PARTIALLY_RETURNED");
    expect(await db.instrument.count({ where: { status: "RECEIVED_PENDING_VERIFICATION" } })).toBe(7);
    expect(await db.calibrationJob.count({ where: { status: "RETURNED" } })).toBe(7);

    const stats = await dashboardStats(db, await loadDueConfig(db), null);
    expect(stats.atVendor).toBe(5);
    expect(stats.aging["0-15"]).toBe(5);
    expect(stats.awaitingVerification).toBe(7);

    // Receive the rest by scanning: plain code, and a QR URL as a keyboard scanner types it
    const qr = await db.instrument.findFirstOrThrow({ where: { id: items[8].instrumentId } });
    const scan1 = await s.tx((t) => receiveByScan(t, "vc-08"));
    expect(scan1).toMatchObject({ code: "VC-08", status: "PARTIALLY_RETURNED" });
    await s.tx((t) => receiveByScan(t, `https://app.example.test/i/${qr.qrToken}`));
    await expect(s.tx((t) => receiveByScan(t, "VC-08"))).rejects.toThrow(/isn't out on any challan/);
    await s.tx((t) =>
      receiveItems(
        t,
        challan.id,
        items.slice(9).map((i) => i.id),
      ),
    );
    expect((await db.deliveryChallan.findUniqueOrThrow({ where: { id: challan.id } })).status).toBe("RETURNED");
    expect(await db.instrumentEvent.count({ where: { type: "RECEIVED" } })).toBe(12);
  }, 120_000);
});

describe("challan rules", () => {
  it("blocks double-booking, validates transport and cancels cleanly before dispatch", async () => {
    const s = await setup("Rules Org", 2);
    const db = tenantDb(s.org.ctx);
    const challan = await challanFor(s);
    const { items } = await challanCandidates(db, s.po.id);
    expect(items.every((i) => i.blocked?.startsWith("On challan"))).toBe(true);
    await expect(
      s.tx((t) =>
        createChallan(t, { poId: s.po.id, lines: [{ poItemId: items[0].poItemId, value: 1, hsnCode: null, description: "x" }] }),
      ),
    ).rejects.toThrow(/On challan/);

    await s.tx((t) => issueChallan(t, challan.id));
    await expect(
      s.tx((t) => dispatchChallan(t, challan.id, { transportMode: "COURIER", courierName: "Blue Dart" })),
    ).rejects.toThrow(/AWB/);
    await expect(s.tx((t) => dispatchChallan(t, challan.id, { transportMode: "VEHICLE", vehicleNo: "123" }))).rejects.toThrow(
      /vehicle number/,
    );
    await expect(s.tx((t) => dispatchChallan(t, challan.id, { transportMode: "BY_HAND", ewayBillNo: "123" }))).rejects.toThrow(
      /12 digits/,
    );

    await s.tx((t) => cancelChallan(t, challan.id));
    expect(await db.instrument.count({ where: { status: "IN_STORE" } })).toBe(2);
    expect((await challanCandidates(db, s.po.id)).items.every((i) => i.blocked === null)).toBe(true);
  });

  it("feeds overdue returns into the list and the digest", async () => {
    const s = await setup("Overdue Org", 1);
    const challan = await challanFor(s);
    await s.tx((t) => issueChallan(t, challan.id));
    await s.tx((t) =>
      dispatchChallan(t, challan.id, { transportMode: "BY_HAND", expectedReturnAt: new Date(Date.now() - 3 * 86_400_000) }),
    );
    const db = tenantDb(s.org.ctx);
    const overdue = await overdueReturns(db);
    expect(overdue.map((o) => o.instrument.code)).toEqual(["VC-01"]);

    // org admin receives the digest (no quality head in this org)
    await prisma.instrument.updateMany({
      where: { organizationId: s.org.organizationId },
      data: { nextDueAt: new Date(Date.now() + 200 * 86_400_000) },
    });
    const res = await runOrgDigest(s.org.organizationId);
    expect(res.sent).toBe(1);
    const note = await db.notification.findFirstOrThrow({ where: { template: "digest.daily" } });
    expect((note.payload as { counts: { returnsOverdue: number } }).counts.returnsOverdue).toBe(1);
  });

  it("refuses to cancel a PO whose instruments are at the lab", async () => {
    const s = await setup("Cancel Org", 1);
    const challan = await challanFor(s);
    await s.tx((t) => issueChallan(t, challan.id));
    await s.tx((t) => dispatchChallan(t, challan.id, { transportMode: "BY_HAND" }));
    const { cancelPurchaseOrder } = await import("@/server/services/purchase-orders");
    await expect(s.tx((t) => cancelPurchaseOrder(t, s.po.id))).rejects.toThrow(/already with the lab/);
  });
});
