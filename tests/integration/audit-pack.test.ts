import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getBoss } from "@/server/jobs/boss";
import { generateAuditPack, requestAuditPack, retryAuditPack } from "@/server/services/audit-pack";
import { createInstrumentType } from "@/server/services/masters";
import { atVendorAgingReport, spendReport, vendorPerformanceReport } from "@/server/services/reports";
import { createVendor } from "@/server/services/vendors";
import { LocalStorage, setStorage, storage } from "@/server/storage";
import { tenantDb, withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

const DAY = 86_400_000;
let dir: string;
let certPdf: Buffer;
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gr-pack-"));
  setStorage(new LocalStorage(dir, "test-secret", "http://localhost:3000"));
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText("Calibration certificate (test)", {
    x: 50,
    y: 780,
    size: 14,
    font: await doc.embedFont(StandardFonts.Helvetica),
  });
  certPdf = Buffer.from(await doc.save());
});
afterAll(async () => {
  setStorage(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
  await (await getBoss()).stop({ graceful: false });
});

/** n instruments; `certs` verified calibrations in the last 90 days with stored certificate PDFs. */
async function fixture(name: string, n: number, certs: number) {
  const org = await makeOrg(name, ["PLT1"]);
  const plantId = org.plants[0].id;
  const tx = <T>(fn: Parameters<typeof withTenantTx<T>>[1]) => withTenantTx(org.ctx, fn);
  const type = await tx((t) =>
    createInstrumentType(t, {
      name: "Vernier",
      category: "DIMENSIONAL",
      defaultFrequencyValue: 12,
      defaultFrequencyUnit: "MONTHS",
      nablRequired: true,
    }),
  );
  const vendor = await tx((t) =>
    createVendor(t, {
      name: "Pack Lab",
      gstin: null,
      pan: null,
      address: null,
      stateCode: "27",
      contacts: [],
      accreditationType: "NABL",
      nablCertNo: "CC-1111",
      nablValidUntil: new Date(Date.now() + 200 * DAY),
      onsiteCapable: false,
      isApproved: true,
      evaluationNotes: null,
    }),
  );
  const now = Date.now();
  const ids = Array.from({ length: n }, () => createId());
  await tx((t) =>
    t.instrument.createMany({
      data: ids.map((id, i) => ({
        id,
        organizationId: org.organizationId,
        plantId,
        code: `VC-${String(i + 1).padStart(4, "0")}`,
        typeId: type.id,
        frequencyValue: 12,
        frequencyUnit: "MONTHS" as const,
        lastCalibratedAt: new Date(now - 30 * DAY),
        // two overdue instruments
        nextDueAt: new Date(now + (i < 2 ? -5 : 200) * DAY),
        qrToken: createId(),
        status: "IN_USE" as const,
      })),
    }),
  );
  const jobs: { id: string; fileId: string; key: string; instrumentId: string; calibratedAt: Date }[] = [];
  for (let i = 0; i < certs; i++) {
    const fileId = createId();
    const key = `${org.organizationId}/certificates/${fileId}.pdf`;
    // one damaged file → placeholder page
    await storage().put({ key, body: i === 0 ? Buffer.from("%PDF-1.4 broken") : certPdf, contentType: "application/pdf" });
    jobs.push({ id: createId(), fileId, key, instrumentId: ids[i % n], calibratedAt: new Date(now - (10 + (i % 60)) * DAY) });
  }
  await tx(async (t) => {
    await t.attachment.createMany({
      data: jobs.map((j) => ({
        id: j.fileId,
        organizationId: org.organizationId,
        entityType: "CalibrationJob",
        entityId: j.id,
        fileKey: j.key,
        fileName: "c.pdf",
        mime: "application/pdf",
        size: 1000,
      })),
    });
    await t.calibrationJob.createMany({
      data: jobs.map((j, i) => ({
        id: j.id,
        organizationId: org.organizationId,
        plantId,
        instrumentId: j.instrumentId,
        vendorId: vendor.id,
        status: i === 1 ? ("VERIFIED_FAIL" as const) : ("CLOSED" as const),
        sentAt: new Date(j.calibratedAt.getTime() - 3 * DAY),
        receivedAt: new Date(j.calibratedAt.getTime() + 2 * DAY),
        calibratedAt: j.calibratedAt,
        certificateNo: `CERT-${i}`,
        result: i === 1 ? ("FAIL" as const) : ("PASS" as const),
        certificateFileId: j.fileId,
        verifiedById: org.actor.id,
        verifiedAt: new Date(j.calibratedAt.getTime() + 3 * DAY),
      })),
    });
    if (certs > 1)
      await t.ootCase.create({
        data: {
          organizationId: org.organizationId,
          plantId,
          jobId: jobs[1].id,
          instrumentId: jobs[1].instrumentId,
          impactNotes: "Checked lots",
          affectedProducts: "None",
        },
      });
  });
  return { org, tx, plantId, vendor };
}

const days = (n: number) => new Date(Date.now() - n * DAY);

describe("M7 audit pack", () => {
  it("acceptance: 500 instruments + 300 certificates generate in a background job and notify the requester", async () => {
    const s = await fixture("Pack Org", 500, 300);
    const pack = await s.tx((t) => requestAuditPack(t, { plantId: s.plantId, from: days(120), to: days(0) }));
    expect(pack.status).toBe("QUEUED");
    const queued = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM pgboss.job WHERE name = 'auditpack.generate' AND data->>'auditPackId' = ${pack.id}`;
    expect(queued).toHaveLength(1);

    const started = Date.now();
    const res = await generateAuditPack(pack.id, s.org.organizationId);
    const elapsed = Date.now() - started;
    expect(res).toMatchObject({ skipped: false });
    const done = await tenantDb(s.org.ctx).auditPack.findUniqueOrThrow({ where: { id: pack.id } });
    expect(done.status).toBe("READY");
    expect(done.stats).toMatchObject({
      instruments: 500,
      overdue: 2,
      calibrations: 300,
      certificates: 299,
      certificatesSkipped: 1,
      ootCases: 1,
      vendors: 1,
    });

    const file = await tenantDb(s.org.ctx).attachment.findUniqueOrThrow({ where: { id: done.fileId! } });
    const pdf = await PDFDocument.load(await storage().get(file.fileKey));
    expect(pdf.getPageCount()).toBe(done.pageCount);
    expect(done.pageCount!).toBeGreaterThan(300 + 10);
    expect(
      await prisma.notification.count({
        where: { organizationId: s.org.organizationId, template: "auditpack.ready", userId: s.org.actor.id },
      }),
    ).toBe(1);
    // a second run of the same job is a no-op
    expect(await generateAuditPack(pack.id, s.org.organizationId)).toEqual({ skipped: true });
    console.info(`[audit-pack] 500 instruments / 300 certificates: ${done.pageCount} pages in ${elapsed} ms`);
  }, 600_000);

  it("validates the period and retries failed packs", async () => {
    const s = await fixture("Pack Org 2", 3, 0);
    await expect(s.tx((t) => requestAuditPack(t, { plantId: s.plantId, from: days(0), to: days(30) }))).rejects.toThrow(
      /before the start/,
    );
    const pack = await s.tx((t) => requestAuditPack(t, { plantId: s.plantId, from: days(30), to: days(0) }));
    await expect(s.tx((t) => retryAuditPack(t, pack.id))).rejects.toThrow(/Only failed/);
    await prisma.auditPack.update({ where: { id: pack.id }, data: { status: "FAILED" } });
    await s.tx((t) => retryAuditPack(t, pack.id));
    expect(await generateAuditPack(pack.id, s.org.organizationId)).toMatchObject({ skipped: false });
    expect((await prisma.auditPack.findUniqueOrThrow({ where: { id: pack.id } })).status).toBe("READY");
  }, 120_000);

  it("is tenant-isolated", async () => {
    const a = await fixture("Pack Org A", 2, 0);
    const pack = await a.tx((t) => requestAuditPack(t, { plantId: a.plantId, from: days(10), to: days(0) }));
    const b = await makeOrg("Pack Org B");
    expect(await tenantDb(b.ctx).auditPack.findUnique({ where: { id: pack.id } })).toBeNull();
    await expect(
      withTenantTx(b.ctx, (t) => requestAuditPack(t, { plantId: a.plantId, from: days(10), to: days(0) })),
    ).rejects.toThrow();
  }, 120_000);
});

describe("M7 reports", () => {
  it("vendor performance, spend and aging from live data", async () => {
    const s = await fixture("Report Org", 10, 5);
    const db = tenantDb(s.org.ctx);
    const period = { plantId: s.plantId, from: days(365), to: new Date() };
    const [perf] = await vendorPerformanceReport(db, period);
    expect(perf).toMatchObject({
      vendorName: "Pack Lab",
      jobs: 5,
      returned: 5,
      avgTatDays: 5,
      verified: 5,
      failed: 1,
      ootRatePct: 20,
    });
    expect(perf.onTimePct).toBeNull(); // no PO turnaround on these jobs

    await s.tx((t) =>
      t.purchaseOrder.create({
        data: {
          organizationId: s.org.organizationId,
          plantId: s.plantId,
          vendorId: s.vendor.id,
          number: "PO/T/1",
          source: "RATE_CONTRACT",
          status: "SENT",
          subtotal: 4500,
          gstAmount: 810,
          total: 5310,
          sentAt: days(5),
        },
      }),
    );
    const spend = await spendReport(db, period);
    expect(spend.grandTotal).toBe(4500);
    expect(spend.vendors[0]).toMatchObject({ vendorName: "Pack Lab", total: 4500 });
    expect(await atVendorAgingReport(db, s.plantId)).toEqual([]);

    const other = await makeOrg("Report Org B");
    expect(await vendorPerformanceReport(tenantDb(other.ctx), { ...period, plantId: null })).toEqual([]);
  }, 120_000);
});
