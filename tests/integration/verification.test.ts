import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Extraction } from "@/domain/cert-extraction";
import { setCertExtractor } from "@/server/ai/cert-extraction";
import { resetEnvCache } from "@/env";
import { prisma } from "@/server/db";
import { extractCertificate } from "@/server/services/cert-extraction";
import { attachCertificate } from "@/server/services/certificates";
import { challanCandidates, createChallan, dispatchChallan, issueChallan, receiveItems } from "@/server/services/challans";
import { createInstrument } from "@/server/services/instruments";
import { createInstrumentType } from "@/server/services/masters";
import { closeOot, decideDisposition, saveAssessment } from "@/server/services/oot";
import { approvePurchaseOrder, createPurchaseOrder, sendPurchaseOrder } from "@/server/services/purchase-orders";
import { rejectCertificate, verifyJob, type VerifyInput } from "@/server/services/verification";
import { addScopeRows, createVendor } from "@/server/services/vendors";
import { LocalStorage, setStorage } from "@/server/storage";
import { tenantDb, withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gr-verify-"));
  setStorage(new LocalStorage(dir, "test-secret", "http://localhost:3000"));
});
afterAll(() => {
  setStorage(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  setCertExtractor(undefined);
  delete process.env.AI_CERT_EXTRACTION;
  resetEnvCache();
});

/** n pressure gauges sent to a NABL lab, received back, certificates uploaded → CERT_UPLOADED. */
async function setup(name: string, n = 3) {
  const org = await makeOrg(name, ["PLT1"]);
  const tx = <T>(fn: Parameters<typeof withTenantTx<T>>[1]) => withTenantTx(org.ctx, fn);
  const plantId = org.plants[0].id;
  const type = await tx((t) =>
    createInstrumentType(t, {
      name: "Pressure gauge",
      category: "PRESSURE",
      parameter: "Pressure",
      unit: "bar",
      defaultFrequencyValue: 12,
      defaultFrequencyUnit: "MONTHS",
      nablRequired: true,
    }),
  );
  const vendor = await tx((t) =>
    createVendor(t, {
      name: "Pressure Lab",
      gstin: null,
      pan: null,
      address: null,
      stateCode: "27",
      contacts: [{ name: "Desk", email: "desk@pressurelab.test", phone: "", isPrimary: true }],
      accreditationType: "NABL",
      nablCertNo: "CC-2345",
      nablValidUntil: new Date(Date.now() + 300 * 86_400_000),
      onsiteCapable: false,
      isApproved: true,
      evaluationNotes: null,
    }),
  );
  await tx((t) =>
    addScopeRows(t, vendor.id, [
      { discipline: "Mechanical", parameter: "Pressure", rangeMin: 0, rangeMax: 700, unit: "bar", cmc: "0.05%" },
    ]),
  );
  const lastCal = new Date("2025-10-01T00:00:00Z");
  const instruments: Awaited<ReturnType<typeof createInstrument>>[] = [];
  for (let i = 1; i <= n; i++) {
    const inst = await tx((t) =>
      createInstrument(t, {
        plantId,
        code: `PG-${String(i).padStart(2, "0")}`,
        typeId: type.id,
        criticality: "A",
        calibrationSource: "EXTERNAL",
        frequencyValue: 12,
        frequencyUnit: "MONTHS",
        nablRequired: true,
        serialNo: `SN-PG-${i}`,
        rangeMin: 0,
        rangeMax: 10,
        unit: "bar",
        lastCalibratedAt: lastCal,
      }),
    );
    instruments.push(inst);
  }
  const po = await tx((t) =>
    createPurchaseOrder(t, {
      plantId,
      vendorId: vendor.id,
      requestId: null,
      rfqId: null,
      source: "RATE_CONTRACT",
      lines: instruments.map((i) => ({
        instrumentId: i.id,
        requestItemId: null,
        description: i.code,
        rate: 500,
        gstPercent: 18,
        tatDays: 7,
      })),
    }),
  );
  await tx((t) => approvePurchaseOrder(t, po.id));
  await tx((t) => sendPurchaseOrder(t, po.id, "http://localhost:3000"));
  const db = tenantDb(org.ctx);
  const { items } = await challanCandidates(db, po.id);
  const c = await tx((t) =>
    createChallan(t, {
      poId: po.id,
      lines: items.map((i) => ({ poItemId: i.poItemId, value: 2000, hsnCode: null, description: i.description })),
    }),
  );
  await tx((t) => issueChallan(t, c.id));
  await tx((t) => dispatchChallan(t, c.id, { transportMode: "BY_HAND" }));
  const challanItems = await db.deliveryChallanItem.findMany({ where: { challanId: c.id } });
  await tx((t) =>
    receiveItems(
      t,
      c.id,
      challanItems.map((i) => i.id),
    ),
  );
  const jobs = await db.calibrationJob.findMany({
    where: { poItem: { poId: po.id } },
    include: { instrument: true },
    orderBy: { instrument: { code: "asc" } },
  });
  for (const j of jobs) await tx((t) => attachCertificate(t, j.id, { name: `${j.instrument.code}.pdf`, bytes: PDF }));
  const uploaded = await db.calibrationJob.findMany({
    where: { id: { in: jobs.map((j) => j.id) } },
    orderBy: { instrument: { code: "asc" } },
  });
  return { org, tx, db, po, vendor, jobs: uploaded, lastCal };
}

const calibratedAt = () => new Date(Date.now() - 3_600_000);
const goodInput = (over: Partial<VerifyInput> = {}): VerifyInput => ({
  certificateNo: "PL/26/0912",
  ulrNo: "CC234526000001234F",
  calibratedAt: calibratedAt(),
  labAccreditationNo: "cc 2345",
  nablMarkPresent: true,
  uncertaintyStated: true,
  scopeConfirmed: null,
  readings: [0, 5, 10].map((nominal) => ({
    pointLabel: `${nominal} bar`,
    nominal,
    asFound: null,
    asLeft: nominal + 0.02,
    permissibleError: 0.1,
    uncertainty: 0.01,
  })),
  ...over,
});

describe("M6: certificate verification", () => {
  it("PASS: dates recomputed, instrument back in store, verifier recorded; PO and request close when all done", async () => {
    const s = await setup("Verify Pass", 2);
    expect(s.jobs.every((j) => j.status === "CERT_UPLOADED")).toBe(true);
    await prisma.instrumentType.updateMany({
      where: { organizationId: s.org.organizationId },
      data: { standardCode: "EN 837-1", standardDate: new Date("1996-01-01") },
    });
    const res = await s.tx((t) => verifyJob(t, s.jobs[0].id, goodInput()));
    expect(res.result).toBe("PASS");
    expect(res.ootCaseId).toBeNull();

    const inst = await s.db.instrument.findUniqueOrThrow({ where: { id: s.jobs[0].instrumentId } });
    expect(inst.status).toBe("IN_STORE");
    expect(inst.lastCalibratedAt).not.toEqual(s.lastCal);
    expect(inst.nextDueAt!.getTime()).toBeGreaterThan(Date.now() + 300 * 86_400_000);
    const job = await s.db.calibrationJob.findUniqueOrThrow({ where: { id: s.jobs[0].id }, include: { readings: true } });
    expect(job).toMatchObject({
      status: "CLOSED",
      result: "PASS",
      verifiedById: s.org.actor.id,
      certificateNo: "PL/26/0912",
      standardCode: "EN 837-1",
    });
    expect(job.readings).toHaveLength(3);
    expect(job.readings.every((r) => r.pass)).toBe(true);
    expect(await s.db.instrumentEvent.count({ where: { instrumentId: inst.id, type: "CALIBRATED" } })).toBe(1);
    expect((await s.db.purchaseOrder.findUniqueOrThrow({ where: { id: s.po.id } })).status).toBe("SENT");

    await s.tx((t) => verifyJob(t, s.jobs[1].id, goodInput()));
    expect((await s.db.purchaseOrder.findUniqueOrThrow({ where: { id: s.po.id } })).status).toBe("CLOSED");
    const audit = await s.db.auditLog.findMany({ where: { entity: "CalibrationJob", entityId: s.jobs[0].id, action: "UPDATE" } });
    expect(audit.length).toBeGreaterThan(0);
  }, 120_000);

  it("FAIL: OOT case with last good calibration date, instrument on hold; quality head dispositions and closes", async () => {
    const s = await setup("Verify Fail", 1);
    const failing = goodInput({
      readings: [{ pointLabel: "10 bar", nominal: 10, asFound: null, asLeft: 10.25, permissibleError: 0.1, uncertainty: 0.01 }],
    });
    const res = await s.tx((t) => verifyJob(t, s.jobs[0].id, failing));
    expect(res.result).toBe("FAIL");
    const oot = await s.db.ootCase.findUniqueOrThrow({ where: { id: res.ootCaseId! } });
    expect(oot).toMatchObject({ status: "OPEN", trigger: "AS_LEFT_FAIL" });
    expect(oot.lastGoodCalibrationAt?.toISOString()).toBe(s.lastCal.toISOString());
    expect((await s.db.instrument.findUniqueOrThrow({ where: { id: s.jobs[0].instrumentId } })).status).toBe("ON_HOLD_OOT");
    expect((await s.db.calibrationJob.findUniqueOrThrow({ where: { id: s.jobs[0].id } })).status).toBe("VERIFIED_FAIL");

    await expect(s.tx((t) => decideDisposition(t, oot.id, "SCRAPPED", "Beyond repair"))).rejects.toThrow(/assessment/);
    await s.tx((t) =>
      saveAssessment(t, oot.id, {
        lastGoodCalibrationAt: s.lastCal,
        impactNotes: "Used on line 3 torque checks",
        affectedProducts: "Lots 2610-2614, part 44-102",
      }),
    );
    await s.tx((t) => decideDisposition(t, oot.id, "SCRAPPED", "Bourdon tube damaged"));
    const decided = await s.db.ootCase.findUniqueOrThrow({ where: { id: oot.id } });
    expect(decided).toMatchObject({ status: "DISPOSITIONED", disposition: "SCRAPPED", decidedById: s.org.actor.id });
    expect((await s.db.instrument.findUniqueOrThrow({ where: { id: s.jobs[0].instrumentId } })).status).toBe("SCRAPPED");
    expect((await s.db.calibrationJob.findUniqueOrThrow({ where: { id: s.jobs[0].id } })).status).toBe("CLOSED");
    await s.tx((t) => closeOot(t, oot.id, "CAPA-26-014"));
    expect((await s.db.ootCase.findUniqueOrThrow({ where: { id: oot.id } })).status).toBe("CLOSED");
  }, 120_000);

  it("as-found failure on a pass opens an assessment-only OOT case; instrument stays in use", async () => {
    const s = await setup("Verify AsFound", 1);
    const input = goodInput({
      readings: [{ pointLabel: "5 bar", nominal: 5, asFound: 5.4, asLeft: 5.01, permissibleError: 0.1, uncertainty: null }],
    });
    const res = await s.tx((t) => verifyJob(t, s.jobs[0].id, input));
    expect(res.result).toBe("PASS");
    const oot = await s.db.ootCase.findUniqueOrThrow({ where: { id: res.ootCaseId! } });
    expect(oot.trigger).toBe("AS_FOUND_FAIL");
    expect((await s.db.instrument.findUniqueOrThrow({ where: { id: s.jobs[0].instrumentId } })).status).toBe("IN_STORE");
    await s.tx((t) =>
      saveAssessment(t, oot.id, {
        lastGoodCalibrationAt: s.lastCal,
        impactNotes: "Reviewed",
        affectedProducts: "None — gauge used for reference only",
      }),
    );
    await expect(s.tx((t) => decideDisposition(t, oot.id, "SCRAPPED", "x"))).rejects.toThrow(/as-found/);
  }, 120_000);

  it("blocks decisions on defective certificates and rejects them back to the lab", async () => {
    const s = await setup("Verify Reject", 1);
    await expect(s.tx((t) => verifyJob(t, s.jobs[0].id, goodInput({ labAccreditationNo: "CC-9999" })))).rejects.toThrow(
      /Reject it back/,
    );
    await expect(s.tx((t) => verifyJob(t, s.jobs[0].id, goodInput({ ulrNo: "", uncertaintyStated: null })))).rejects.toThrow(
      /Complete the checklist/,
    );
    await s.tx((t) => rejectCertificate(t, s.jobs[0].id, "Accreditation number doesn't match the lab"));
    const job = await s.db.calibrationJob.findUniqueOrThrow({ where: { id: s.jobs[0].id } });
    expect(job).toMatchObject({
      status: "RETURNED",
      certificateFileId: null,
      certRejectionReason: "Accreditation number doesn't match the lab",
    });
    expect(await prisma.notification.count({ where: { organizationId: s.org.organizationId, template: "cert.rejected" } })).toBe(
      1,
    );
    // the lab re-uploads → back in the queue
    await s.tx((t) => attachCertificate(t, s.jobs[0].id, { name: "fixed.pdf", bytes: PDF }));
    expect((await s.db.calibrationJob.findUniqueOrThrow({ where: { id: s.jobs[0].id } })).status).toBe("CERT_UPLOADED");
  }, 120_000);
});

describe("M6 acceptance: AI extraction", () => {
  const extraction: Extraction = {
    certificateNo: "PL/26/0912",
    ulrNo: "CC234526000001234F",
    calibrationDate: new Date().toISOString().slice(0, 10),
    nextDueDate: null,
    labName: "Pressure Lab",
    accreditationNo: "CC-2345",
    nablMarkPresent: true,
    instrumentSerial: "SN-PG-1",
    readings: [{ pointLabel: "5 bar", nominal: 5, asFound: null, asLeft: 5.02, permissibleError: 0.1, uncertainty: 0.01 }],
    confidence: {
      certificateNo: 0.98,
      ulrNo: 0.6,
      calibrationDate: 0.95,
      accreditationNo: 0.9,
      nablMarkPresent: 0.9,
      instrumentSerial: 0.9,
      readings: 0.85,
    },
  };

  it("AI off: extraction refused, manual flow works end to end", async () => {
    const s = await setup("AI Off", 1);
    await expect(extractCertificate(s.org.ctx, s.db, s.jobs[0].id)).rejects.toThrow(/turned off/);
    const res = await s.tx((t) => verifyJob(t, s.jobs[0].id, goodInput()));
    expect(res.result).toBe("PASS");
    const job = await s.db.calibrationJob.findUniqueOrThrow({ where: { id: s.jobs[0].id } });
    expect(job.aiExtraction).toBeNull();
    expect(job.verifiedById).toBe(s.org.actor.id);
  }, 120_000);

  it("AI on: prefills editable values, flags low confidence, stores raw output, never decides", async () => {
    process.env.AI_CERT_EXTRACTION = "true";
    resetEnvCache();
    setCertExtractor(async (pdf) => {
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      return extraction;
    });
    const s = await setup("AI On", 1);
    const prefill = await extractCertificate(s.org.ctx, s.db, s.jobs[0].id);
    expect(prefill).toMatchObject({ certificateNo: "PL/26/0912", serialMismatch: false, lowConfidence: ["ulrNo"] });
    const stored = await s.db.calibrationJob.findUniqueOrThrow({ where: { id: s.jobs[0].id } });
    expect(stored.status).toBe("CERT_UPLOADED"); // not auto-approved
    expect(stored.aiExtraction).toMatchObject({ certificateNo: "PL/26/0912" });
    expect(stored.aiConfidence).toBeCloseTo(0.6);
    expect(stored.verifiedById).toBeNull();

    // Verifier edits a prefilled value and decides
    await s.tx((t) => verifyJob(t, s.jobs[0].id, goodInput({ certificateNo: "PL/26/0912-A" })));
    const job = await s.db.calibrationJob.findUniqueOrThrow({ where: { id: s.jobs[0].id } });
    expect(job).toMatchObject({ certificateNo: "PL/26/0912-A", verifiedById: s.org.actor.id, status: "CLOSED" });
  }, 120_000);
});

describe("M6 tenancy", () => {
  it("one org can't read another's OOT cases or readings", async () => {
    const a = await setup("OOT Org A", 1);
    const res = await a.tx((t) =>
      verifyJob(
        t,
        a.jobs[0].id,
        goodInput({
          readings: [{ pointLabel: "x", nominal: 1, asFound: null, asLeft: 2, permissibleError: 0.1, uncertainty: null }],
        }),
      ),
    );
    const b = await makeOrg("OOT Org B");
    const dbB = tenantDb(b.ctx);
    expect(await dbB.ootCase.findUnique({ where: { id: res.ootCaseId! } })).toBeNull();
    expect(await dbB.calibrationReading.count()).toBe(0);
    await expect(
      withTenantTx(b.ctx, (t) =>
        saveAssessment(t, res.ootCaseId!, { lastGoodCalibrationAt: null, impactNotes: "", affectedProducts: "x" }),
      ),
    ).rejects.toThrow();
  }, 120_000);
});
