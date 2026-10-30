import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { ConsoleEmailProvider, emailProvider } from "@/server/notify/email";
import { deliverNotification } from "@/server/notify/notifier";
import {
  approveRequest,
  createRequestsFromSelection,
  releaseRequest,
  setItemSourcing,
  submitRequest,
} from "@/server/services/calibration-requests";
import { createInstrument } from "@/server/services/instruments";
import { createInstrumentType } from "@/server/services/masters";
import { approvePurchaseOrder, sendPurchaseOrder } from "@/server/services/purchase-orders";
import { activateRateContract, createRateContract, saveRateItems } from "@/server/services/rate-contracts";
import { awardRfq, reviewQuote, saveQuote } from "@/server/services/rfqs";
import { addScopeRows, createVendor, nablExpiringCount, parseScopeCsv } from "@/server/services/vendors";
import { tenantDb, withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

const DAY = 86_400_000;
const today = () => new Date(Date.now() - DAY);
const inAYear = () => new Date(Date.now() + 300 * DAY);

async function setup(name: string) {
  const org = await makeOrg(name, ["PLT1"]);
  const tx = <T>(fn: Parameters<typeof withTenantTx<T>>[1]) => withTenantTx(org.ctx, fn);
  const type = (n: string, parameter: string, unit: string) =>
    tx((t) =>
      createInstrumentType(t, {
        name: n,
        category: "DIMENSIONAL",
        parameter,
        unit,
        defaultFrequencyValue: 12,
        defaultFrequencyUnit: "MONTHS",
        nablRequired: true,
      }),
    );
  const [tA, tB, tC] = [
    await type("Vernier", "Length", "mm"),
    await type("Micrometer", "Length", "mm"),
    await type("Pressure Gauge", "Pressure", "bar"),
  ];
  const vendor = (n: string, gstin: string | null, approved = true) =>
    tx((t) =>
      createVendor(t, {
        name: n,
        gstin,
        pan: null,
        address: null,
        stateCode: gstin ? null : "27",
        contacts: [{ name: "Lab desk", email: `${n.toLowerCase().replace(/\W/g, "")}@lab.test`, phone: "", isPrimary: true }],
        accreditationType: "NABL",
        nablCertNo: `CC-${n.length}00`,
        nablValidUntil: new Date(Date.now() + 400 * DAY),
        onsiteCapable: false,
        isApproved: approved,
        evaluationNotes: null,
      }),
    );
  const v1 = await vendor("Precision Cal Labs", "27AABCN5678M1ZT");
  const v2 = await vendor("Metro Metrology", "29AAECP2468Q1ZM"); // Karnataka → inter-state for a PLT with state 27
  const v3 = await vendor("Pressure Masters", null);
  await tx(async (t) => {
    await addScopeRows(t, v1.id, [
      { discipline: "Mechanical", parameter: "Length", rangeMin: 0, rangeMax: 1000, unit: "mm", cmc: "2 µm" },
    ]);
    await addScopeRows(t, v2.id, [
      { discipline: "Mechanical", parameter: "Length", rangeMin: 0, rangeMax: 300, unit: "mm", cmc: "3 µm" },
    ]);
    await addScopeRows(
      t,
      v3.id,
      parseScopeCsv("Discipline,Parameter,Range Min,Range Max,Unit,CMC\nMechanical,Pressure,0,700,bar,0.05% FS").rows,
    );
  });
  const contract = async (vendorId: string, number: string, items: { typeId: string; rate: number; tat: number }[]) =>
    tx(async (t) => {
      const c = await createRateContract(t, {
        vendorId,
        number,
        plantId: null,
        validFrom: today(),
        validTo: inAYear(),
        notes: null,
      });
      await saveRateItems(
        t,
        c.id,
        items.map((i) => ({ instrumentTypeId: i.typeId, rate: i.rate, gstPercent: 18, onsiteRate: null, tatDays: i.tat })),
      );
      await activateRateContract(t, c.id);
      return c;
    });
  await contract(v1.id, `RC-${name}-1`, [
    { typeId: tA.id, rate: 500, tat: 7 },
    { typeId: tB.id, rate: 600, tat: 7 },
  ]);
  await contract(v2.id, `RC-${name}-2`, [{ typeId: tA.id, rate: 450, tat: 10 }]);
  const inst = (code: string, typeId: string, rangeMax: number, unit: string) =>
    tx((t) =>
      createInstrument(t, {
        plantId: org.plants[0].id,
        code,
        typeId,
        rangeMin: 0,
        rangeMax,
        unit,
        criticality: "B",
        calibrationSource: "EXTERNAL",
        frequencyValue: 12,
        frequencyUnit: "MONTHS",
        nablRequired: true,
        nextDueAt: new Date(Date.now() + 5 * DAY),
      }),
    );
  return { org, tx, tA, tB, tC, v1, v2, v3, inst };
}

describe("M3 acceptance: request → POs + RFQ in one click", () => {
  it("40 instruments (30 on contract across 2 vendors, 10 needing RFQ) → 2 draft POs and 1 RFQ", async () => {
    const s = await setup("Purchase Org");
    // stateCode on the plant makes GST intra/inter-state meaningful
    await prisma.plant.update({ where: { id: s.org.plants[0].id }, data: { stateCode: "27", gstin: "27AADCD4321K1ZR" } });
    const ids: string[] = [];
    for (let i = 1; i <= 15; i++) ids.push((await s.inst(`VC-${i}`, s.tA.id, 150, "mm")).id);
    for (let i = 1; i <= 15; i++) ids.push((await s.inst(`MM-${i}`, s.tB.id, 25, "mm")).id);
    for (let i = 1; i <= 10; i++) ids.push((await s.inst(`PG-${i}`, s.tC.id, 10, "bar")).id);

    const { requests } = await s.tx((t) => createRequestsFromSelection(t, ids));
    const reqId = requests[0].id;
    const items = await tenantDb(s.org.ctx).calibrationRequestItem.findMany({
      where: { requestId: reqId },
      include: { instrument: true },
    });
    const vendorOf = (prefix: string) =>
      new Set(items.filter((i) => i.instrument.code.startsWith(prefix)).map((i) => i.proposedVendorId ?? i.sourcing));
    expect(vendorOf("VC-")).toEqual(new Set([s.v2.id])); // cheaper
    expect(vendorOf("MM-")).toEqual(new Set([s.v1.id]));
    expect(vendorOf("PG-")).toEqual(new Set(["RFQ"]));

    await s.tx((t) => submitRequest(t, reqId));
    await s.tx((t) => approveRequest(t, reqId));
    const released = await s.tx((t) => releaseRequest(t, reqId));

    expect(released.purchaseOrders).toHaveLength(2);
    expect(released.purchaseOrders.map((p) => p.items).sort()).toEqual([15, 15]);
    expect(released.rfq).toMatchObject({ items: 10, number: expect.stringMatching(/^RFQ\/PLT1\//) });

    const db = tenantDb(s.org.ctx);
    const pos = await db.purchaseOrder.findMany({ include: { items: true } });
    expect(pos.every((p) => p.status === "DRAFT" && p.number.startsWith("PO/PLT1/"))).toBe(true);
    const poV2 = pos.find((p) => p.vendorId === s.v2.id)!;
    expect(poV2.interState).toBe(true); // Karnataka lab → Maharashtra plant
    expect(poV2.subtotal.toNumber()).toBe(15 * 450);
    expect(poV2.total.toNumber()).toBe(15 * 450 * 1.18);
    const poV1 = pos.find((p) => p.vendorId === s.v1.id)!;
    expect(poV1.interState).toBe(false);
    expect(poV1.items[0].sacCode).toBe("998346");

    const invited = await db.rfqVendor.findMany({ where: { rfqId: released.rfq!.id } });
    expect(invited.map((v) => v.vendorId)).toEqual([s.v3.id]); // only the lab with pressure scope
    expect((await db.calibrationRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("SOURCING");

    // RFQ: quote → technical approval → award → PO; request becomes PO_RAISED
    const rfqItems = items.filter((i) => i.instrument.code.startsWith("PG-"));
    const quote = await s.tx((t) =>
      saveQuote(t, released.rfq!.id, s.v3.id, {
        lines: rfqItems.map((i) => ({ requestItemId: i.id, rate: 800, gstPercent: 18, tatDays: 5, nablInScope: true })),
        validUntil: null,
        remarks: null,
      }),
    );
    await expect(
      s.tx((t) => awardRfq(t, released.rfq!.id, Object.fromEntries(rfqItems.map((i) => [i.id, "x"])))),
    ).rejects.toThrow();
    await s.tx((t) => reviewQuote(t, quote.id, true, null));
    const lines = await db.quoteItem.findMany({ where: { quoteId: quote.id } });
    const rfqPos = await s.tx((t) =>
      awardRfq(t, released.rfq!.id, Object.fromEntries(lines.map((l) => [l.requestItemId, l.id]))),
    );
    expect(rfqPos).toHaveLength(1);
    expect((await db.calibrationRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PO_RAISED");
    expect((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("AWARDED");

    // Approve and send: vendor contacts get the PO PDF by email
    await s.tx((t) => approvePurchaseOrder(t, poV1.id));
    const sent = await s.tx((t) => sendPurchaseOrder(t, poV1.id, "http://localhost:3000"));
    expect(sent.emailed).toBe(1);
    const note = await db.notification.findFirstOrThrow({ where: { template: "po.sent" } });
    await deliverNotification(note.id);
    const provider = emailProvider() as ConsoleEmailProvider;
    const mail = provider.sent.at(-1)!;
    expect(mail.to).toBe("precisioncallabs@lab.test");
    expect(mail.attachments?.[0].filename).toMatch(/^PO-PLT1-.*\.pdf$/);
    expect(mail.attachments?.[0].content.subarray(0, 4).toString()).toBe("%PDF");
  }, 120_000);

  it("respects manual overrides and requires approval before release", async () => {
    const s = await setup("Override Org");
    const a = await s.inst("VC-X", s.tA.id, 150, "mm");
    const { requests } = await s.tx((t) => createRequestsFromSelection(t, [a.id]));
    const item = await tenantDb(s.org.ctx).calibrationRequestItem.findFirstOrThrow({ where: { requestId: requests[0].id } });
    await s.tx((t) => setItemSourcing(t, item.id, "RFQ"));
    await expect(s.tx((t) => releaseRequest(t, requests[0].id))).rejects.toThrow(/Only approved/);
    await s.tx((t) => submitRequest(t, requests[0].id));
    const after = await tenantDb(s.org.ctx).calibrationRequestItem.findFirstOrThrow({ where: { id: item.id } });
    expect(after.sourcing).toBe("RFQ"); // submit didn't overwrite the override
  });
});

describe("vendors", () => {
  it("are visible only to linked organizations", async () => {
    const a = await setup("Vendor Org A");
    const b = await makeOrg("Vendor Org B");
    const dbB = tenantDb(b.ctx);
    expect(await dbB.vendor.count()).toBe(0);
    expect(await dbB.vendorScope.count()).toBe(0);
    expect(await dbB.vendor.findUnique({ where: { id: a.v1.id } })).toBeNull();
    await expect(withTenantTx(b.ctx, (t) => t.vendor.update({ where: { id: a.v1.id }, data: { name: "x" } }))).rejects.toThrow();
  });

  it("counts approved NABL labs expiring within 60 days", async () => {
    const s = await setup("NABL Org");
    await prisma.vendor.update({ where: { id: s.v2.id }, data: { nablValidUntil: new Date(Date.now() + 20 * DAY) } });
    expect(await nablExpiringCount(tenantDb(s.org.ctx), s.org.organizationId)).toBe(1);
  });

  it("parses scope CSVs with loose headers and reports bad lines", () => {
    const { rows, errors } = parseScopeCsv(
      "Field,Measurand,Min,Max,UOM,BMC\nMechanical,Length,0,300,mm,2 µm\nMechanical,,0,10,bar,\nThermal,Temperature,-50,abc,°C,",
    );
    expect(rows).toEqual([
      { discipline: "Mechanical", parameter: "Length", rangeMin: 0, rangeMax: 300, unit: "mm", cmc: "2 µm" },
    ]);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
  });
});
