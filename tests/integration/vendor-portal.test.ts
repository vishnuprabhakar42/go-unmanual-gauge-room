import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { attachmentUrl } from "@/server/services/certificates";
import { challanCandidates, createChallan, dispatchChallan, issueChallan, receiveItems } from "@/server/services/challans";
import { createInstrument } from "@/server/services/instruments";
import { createInstrumentType } from "@/server/services/masters";
import { approvePurchaseOrder, createPurchaseOrder, sendPurchaseOrder } from "@/server/services/purchase-orders";
import { inviteVendorUser } from "@/server/services/vendor-users";
import { createVendor } from "@/server/services/vendors";
import { LocalStorage, setStorage } from "@/server/storage";
import { tenantDb, withTenantTx, type TenantContext } from "@/server/tenant";
import {
  portalAcknowledgePo,
  portalJobs,
  portalOrder,
  portalOrders,
  portalRfq,
  portalSubmitQuote,
  portalUpdateJob,
  portalUploadCertificate,
} from "@/server/vendor-portal/data";
import type { VendorContext } from "@/server/vendor-portal/scope";
import { makeOrg } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
let dir: string;
let store: LocalStorage;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gr-storage-"));
  store = new LocalStorage(dir, "test-secret", "http://localhost:3000");
  setStorage(store);
});
afterAll(() => {
  setStorage(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

async function orgWithType(name: string) {
  const org = await makeOrg(name, ["PLT1"]);
  const type = await withTenantTx(org.ctx, (t) =>
    createInstrumentType(t, {
      name: "Vernier",
      category: "DIMENSIONAL",
      defaultFrequencyValue: 12,
      defaultFrequencyUnit: "MONTHS",
      nablRequired: true,
    }),
  );
  return { ...org, type };
}

const vendorData = (name: string) => ({
  name,
  gstin: null,
  pan: null,
  address: null,
  stateCode: "27",
  contacts: [{ name: "Desk", email: `${name.toLowerCase().replace(/\W/g, "")}@lab.test`, phone: "", isPrimary: true }],
  accreditationType: "NABL" as const,
  nablCertNo: "CC-9",
  nablValidUntil: new Date(Date.now() + 300 * 86_400_000),
  onsiteCapable: false,
  isApproved: true,
  evaluationNotes: null,
});

async function sentPo(ctx: TenantContext, plantId: string, vendorId: string, typeId: string, codes: string[], dispatch: boolean) {
  const instruments: Awaited<ReturnType<typeof createInstrument>>[] = [];
  for (const code of codes) {
    instruments.push(
      await withTenantTx(ctx, (t) =>
        createInstrument(t, {
          plantId,
          code,
          typeId,
          criticality: "B",
          calibrationSource: "EXTERNAL",
          frequencyValue: 12,
          frequencyUnit: "MONTHS",
          nablRequired: true,
          purchaseValue: 1000,
          serialNo: `SN-${code}`,
        }),
      ),
    );
  }
  const po = await withTenantTx(ctx, (t) =>
    createPurchaseOrder(t, {
      plantId,
      vendorId,
      requestId: null,
      rfqId: null,
      source: "RATE_CONTRACT",
      lines: instruments.map((i) => ({
        instrumentId: i.id,
        requestItemId: null,
        description: i.code,
        rate: 400,
        gstPercent: 18,
        tatDays: 7,
      })),
    }),
  );
  await withTenantTx(ctx, (t) => approvePurchaseOrder(t, po.id));
  await withTenantTx(ctx, (t) => sendPurchaseOrder(t, po.id, "http://localhost:3000"));
  let challanId: string | null = null;
  if (dispatch) {
    const { items } = await challanCandidates(tenantDb(ctx), po.id);
    const c = await withTenantTx(ctx, (t) =>
      createChallan(t, {
        poId: po.id,
        lines: items.map((i) => ({ poItemId: i.poItemId, value: 1000, hsnCode: null, description: i.description })),
      }),
    );
    await withTenantTx(ctx, (t) => issueChallan(t, c.id));
    await withTenantTx(ctx, (t) => dispatchChallan(t, c.id, { transportMode: "BY_HAND" }));
    challanId = c.id;
  }
  return { po, instruments, challanId };
}

describe("vendor portal", () => {
  it("shows a lab only its own documents, across every customer that linked it", async () => {
    const a = await orgWithType("Portal Org A");
    const b = await orgWithType("Portal Org B");
    const v1 = await withTenantTx(a.ctx, (t) => createVendor(t, vendorData("Lab One")));
    const v2 = await withTenantTx(a.ctx, (t) => createVendor(t, vendorData("Lab Two")));
    await prisma.vendorLink.create({ data: { organizationId: b.organizationId, vendorId: v1.id, isApproved: true } }); // Org B also uses Lab One

    const aV1 = await sentPo(a.ctx, a.plants[0].id, v1.id, a.type.id, ["A-1", "A-2"], true);
    const aV2 = await sentPo(a.ctx, a.plants[0].id, v2.id, a.type.id, ["A-3"], true);
    const bV1 = await sentPo(b.ctx, b.plants[0].id, v1.id, b.type.id, ["B-1"], false);

    const labUser = await prisma.user.create({ data: { email: `${createId()}@lab-one.test`, name: "Lab One user" } });
    const ctx: VendorContext = {
      user: { id: labUser.id, name: labUser.name, email: labUser.email },
      vendors: [{ id: v1.id, name: "Lab One" }],
      links: [
        { vendorId: v1.id, organizationId: a.organizationId, orgName: "Portal Org A" },
        { vendorId: v1.id, organizationId: b.organizationId, orgName: "Portal Org B" },
      ],
      ip: null,
    };

    const orders = await portalOrders(ctx);
    expect(orders.map((o) => o.id).sort()).toEqual([aV1.po.id, bV1.po.id].sort());
    expect(await portalOrder(ctx, aV2.po.id)).toBeNull();
    const jobs = await portalJobs(ctx);
    expect(jobs.map((j) => j.instrument.code).sort()).toEqual(["A-1", "A-2"]);
    const otherJob = await prisma.calibrationJob.findFirstOrThrow({ where: { vendorId: v2.id } });
    await expect(portalUpdateJob(ctx, otherJob.id, { to: "RECEIVED_AT_LAB" })).rejects.toThrow(/Not available/);
    await expect(portalAcknowledgePo(ctx, aV2.po.id)).rejects.toThrow(/Not available/);

    // Acknowledge (audited as the lab user in Org B)
    await portalAcknowledgePo(ctx, bV1.po.id);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: bV1.po.id } })).status).toBe("ACKNOWLEDGED");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: b.organizationId, entity: "PurchaseOrder", entityId: bV1.po.id, action: "STATUS_CHANGE" },
      orderBy: { at: "desc" },
    });
    expect(audit.actorId).toBe(labUser.id);

    // Lab progress + certificate before the instrument returns; plant receipt then completes the job
    const [j1, j2] = jobs.sort((x, y) => x.instrument.code.localeCompare(y.instrument.code));
    await portalUpdateJob(ctx, j1.id, { to: "RECEIVED_AT_LAB" });
    await portalUpdateJob(ctx, j1.id, { to: "IN_PROGRESS" });
    await expect(portalUpdateJob(ctx, j1.id, { to: "DISPATCHED_BACK" })).rejects.toThrow(/AWB/);
    await portalUpdateJob(ctx, j1.id, { to: "DISPATCHED_BACK", returnCourier: "DTDC", returnAwb: "D12345" });
    const up = await portalUploadCertificate(ctx, j1.id, { name: "A-1.pdf", bytes: PDF });
    expect(up.code).toBe("A-1");
    await expect(portalUploadCertificate(ctx, j2.id, { name: "fake.pdf", bytes: Buffer.from("hello") })).rejects.toThrow(
      /not a PDF/,
    );
    expect((await prisma.calibrationJob.findUniqueOrThrow({ where: { id: j1.id } })).status).toBe("AT_LAB");

    const items = await prisma.deliveryChallanItem.findMany({ where: { challanId: aV1.challanId! } });
    await withTenantTx(a.ctx, (t) =>
      receiveItems(
        t,
        aV1.challanId!,
        items.map((i) => i.id),
      ),
    );
    const done = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: j1.id } });
    expect(done.status).toBe("CERT_UPLOADED");
    expect((await prisma.calibrationJob.findUniqueOrThrow({ where: { id: j2.id } })).status).toBe("RETURNED");

    // Certificate after return moves straight to CERT_UPLOADED; files are served by signed URL only
    await portalUploadCertificate(ctx, j2.id, { name: "A-2.pdf", bytes: PDF });
    expect((await prisma.calibrationJob.findUniqueOrThrow({ where: { id: j2.id } })).status).toBe("CERT_UPLOADED");
    const url = new URL((await attachmentUrl(tenantDb(a.ctx), done.certificateFileId!))!);
    const key = decodeURIComponent(url.pathname.replace("/api/files/", ""));
    const q = url.searchParams;
    expect(store.verify(key, Number(q.get("exp")), q.get("name")!, q.get("type")!, q.get("sig")!)).toBe(true);
    expect(store.verify(key, Number(q.get("exp")), q.get("name")!, q.get("type")!, "tampered")).toBe(false);
    expect(await attachmentUrl(tenantDb(b.ctx), done.certificateFileId!)).toBeNull(); // other org can't resolve it
  }, 120_000);

  it("lets an invited lab quote on an RFQ and records the portal user", async () => {
    const a = await orgWithType("Quote Org");
    const v = await withTenantTx(a.ctx, (t) => createVendor(t, vendorData("Quote Lab")));
    const inst = await withTenantTx(a.ctx, (t) =>
      createInstrument(t, {
        plantId: a.plants[0].id,
        code: "Q-1",
        typeId: a.type.id,
        criticality: "B",
        calibrationSource: "EXTERNAL",
        frequencyValue: 12,
        frequencyUnit: "MONTHS",
        nablRequired: true,
      }),
    );
    const { requests } = await withTenantTx(a.ctx, async (t) =>
      (await import("@/server/services/calibration-requests")).createRequestsFromSelection(t, [inst.id]),
    );
    await withTenantTx(a.ctx, async (t) => {
      const svc = await import("@/server/services/calibration-requests");
      await svc.submitRequest(t, requests[0].id);
      await svc.approveRequest(t, requests[0].id);
    });
    const released = await withTenantTx(a.ctx, async (t) =>
      (await import("@/server/services/calibration-requests")).releaseRequest(t, requests[0].id),
    );
    const rfqId = released.rfq!.id;
    await withTenantTx(a.ctx, async (t) => (await import("@/server/services/rfqs")).inviteVendors(t, rfqId, [v.id]));
    expect(await tenantDb(a.ctx).notification.count({ where: { template: "rfq.invited" } })).toBe(1);

    const labUser = await prisma.user.create({ data: { email: `${createId()}@quote-lab.test` } });
    const ctx: VendorContext = {
      user: { id: labUser.id, name: null, email: labUser.email },
      vendors: [{ id: v.id, name: "Quote Lab" }],
      links: [{ vendorId: v.id, organizationId: a.organizationId, orgName: "Quote Org" }],
      ip: null,
    };
    const view = await portalRfq(ctx, rfqId);
    expect(view?.items.map((i) => i.instrument.code)).toEqual(["Q-1"]);
    expect((await prisma.rfqVendor.findFirstOrThrow({ where: { rfqId, vendorId: v.id } })).viewedAt).not.toBeNull();
    await portalSubmitQuote(ctx, rfqId, {
      lines: [{ requestItemId: view!.items[0].id, rate: 650, gstPercent: 18, tatDays: 5, nablInScope: true }],
      validUntil: null,
      remarks: "Incl. pickup",
    });
    const quote = await prisma.quote.findFirstOrThrow({ where: { rfqId, vendorId: v.id }, include: { items: true } });
    expect(quote.enteredById).toBe(labUser.id);
    expect(quote.items[0].rate.toNumber()).toBe(650);

    const stranger: VendorContext = { ...ctx, vendors: [], links: [] };
    expect(await portalRfq(stranger, rfqId)).toBeNull();
    await expect(portalSubmitQuote(stranger, rfqId, { lines: [], validUntil: null, remarks: null })).rejects.toThrow(
      /Not available/,
    );
  }, 120_000);

  it("invites portal users for a lab but never for internal users", async () => {
    const a = await orgWithType("Invite Org");
    const v = await withTenantTx(a.ctx, (t) => createVendor(t, vendorData("Invite Lab")));
    const email = `${createId()}@invite-lab.test`;
    await withTenantTx(a.ctx, (t) => inviteVendorUser(t, v.id, { name: "Lab tech", email }, "http://localhost:3000/vendor"));
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { vendorUsers: true, memberships: true } });
    expect(user.vendorUsers.map((x) => x.vendorId)).toEqual([v.id]);
    expect(user.memberships).toEqual([]);
    await expect(
      withTenantTx(a.ctx, (t) => inviteVendorUser(t, v.id, { name: "Admin", email: a.actor.email }, "http://x.test/vendor")),
    ).rejects.toThrow(/internal user/);
  });
});
