"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prefill } from "@/domain/cert-extraction";
import { OOT_DISPOSITIONS } from "@/domain/oot";
import { ForbiddenError, type Permission } from "@/domain/rbac";
import { draftToReading } from "@/domain/readings";
import { dateInput } from "@/domain/instrument-schemas";
import { defineAction, toActionError, type ActionResult } from "@/server/action";
import { getAppContext, type AppContext } from "@/server/context";
import { UserError } from "@/server/errors";
import { extractCertificate } from "@/server/services/cert-extraction";
import { closeOot, decideDisposition, saveAssessment } from "@/server/services/oot";
import { rejectCertificate, verifyJob } from "@/server/services/verification";
import { tenantDb, type TenantTx } from "@/server/tenant";

const id = z.string().min(1);
const refresh = (...paths: string[]) => {
  for (const p of ["/verification", "/verification/oot", "/dashboard", "/instruments", "/dispatch/lab-jobs", ...paths])
    revalidatePath(p);
};

/** Plant-level permission check once the record's plant is known. */
async function assertPlant(app: AppContext, permission: Permission, plantId: string) {
  if (!app.can(permission, plantId)) throw new ForbiddenError(permission);
}
async function jobPlant(tx: TenantTx, jobId: string) {
  return (await tx.calibrationJob.findUniqueOrThrow({ where: { id: jobId }, select: { plantId: true } })).plantId;
}
async function ootPlant(tx: TenantTx, ootId: string) {
  return (await tx.ootCase.findUniqueOrThrow({ where: { id: ootId }, select: { plantId: true } })).plantId;
}

const readingDraft = z.object({
  pointLabel: z.string().max(60),
  nominal: z.string().max(30),
  asFound: z.string().max(30),
  asLeft: z.string().max(30),
  permissibleError: z.string().max(30),
  uncertainty: z.string().max(30),
});
const triState = z.enum(["yes", "no", ""]).transform((v) => (v === "" ? null : v === "yes"));

export const verifyAction = defineAction(
  {
    permission: "certificate.verify",
    input: z.object({
      jobId: id,
      certificateNo: z.string().trim().max(80),
      ulrNo: z.string().trim().max(40),
      calibratedAt: dateInput,
      labAccreditationNo: z.string().trim().max(40),
      nablMarkPresent: triState,
      uncertaintyStated: triState,
      scopeConfirmed: triState,
      readings: z.array(readingDraft).min(1, "Enter at least one reading").max(200),
    }),
  },
  async (input, { tx, app }) => {
    await assertPlant(app, "certificate.verify", await jobPlant(tx, input.jobId));
    if (!input.calibratedAt) throw new UserError("Enter the calibration date", { calibratedAt: ["Enter the calibration date"] });
    const readings = input.readings.map((d, i) => {
      const r = draftToReading(d);
      if (typeof r === "string") throw new UserError(`Reading ${i + 1}: ${r}`);
      return r;
    });
    const res = await verifyJob(tx, input.jobId, { ...input, calibratedAt: input.calibratedAt, readings });
    refresh();
    return res;
  },
);

export const rejectCertificateAction = defineAction(
  {
    permission: "certificate.verify",
    input: z.object({ jobId: id, reason: z.string().trim().min(5, "Explain what's wrong").max(1000) }),
  },
  async ({ jobId, reason }, { tx, app }) => {
    await assertPlant(app, "certificate.verify", await jobPlant(tx, jobId));
    await rejectCertificate(tx, jobId, reason);
    refresh();
  },
);

/** Not a defineAction: the model call must not hold a DB transaction open. */
export async function extractCertificateAction(jobId: string): Promise<ActionResult<Prefill | null>> {
  try {
    const app = await getAppContext();
    if (!app) return { ok: false, error: "Your session has expired. Please sign in again." };
    const db = tenantDb(app.tenant);
    const job = await db.calibrationJob.findUnique({ where: { id: z.string().min(1).parse(jobId) }, select: { plantId: true } });
    if (!job) return { ok: false, error: "Record not found." };
    await assertPlant(app, "certificate.verify", job.plantId);
    return { ok: true, data: await extractCertificate(app.tenant, db, jobId) };
  } catch (err) {
    return toActionError(err);
  }
}

export const saveAssessmentAction = defineAction(
  {
    permission: "certificate.verify",
    input: z.object({
      id,
      lastGoodCalibrationAt: dateInput,
      impactNotes: z.string().max(4000),
      affectedProducts: z.string().max(4000),
    }),
  },
  async (input, { tx, app }) => {
    const plantId = await ootPlant(tx, input.id);
    if (!app.can("certificate.verify", plantId) && !app.can("oot.decide", plantId))
      throw new ForbiddenError("certificate.verify");
    await saveAssessment(tx, input.id, { ...input, lastGoodCalibrationAt: input.lastGoodCalibrationAt ?? null });
    refresh(`/verification/oot/${input.id}`);
  },
);

export const decideDispositionAction = defineAction(
  {
    permission: "oot.decide",
    input: z.object({ id, disposition: z.enum(OOT_DISPOSITIONS), notes: z.string().trim().max(2000) }),
  },
  async ({ id, disposition, notes }, { tx, app }) => {
    await assertPlant(app, "oot.decide", await ootPlant(tx, id));
    await decideDisposition(tx, id, disposition, notes);
    refresh(`/verification/oot/${id}`);
  },
);

export const closeOotAction = defineAction(
  { permission: "oot.decide", input: z.object({ id, capaRef: z.string().trim().max(60) }) },
  async ({ id, capaRef }, { tx, app }) => {
    await assertPlant(app, "oot.decide", await ootPlant(tx, id));
    await closeOot(tx, id, capaRef);
    refresh(`/verification/oot/${id}`);
  },
);
