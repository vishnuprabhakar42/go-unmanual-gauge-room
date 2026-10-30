import { computeNextDue } from "@/domain/due";
import { effectiveStandard } from "@/domain/standards";
import { computeReading, overallResult, type ReadingInput } from "@/domain/readings";
import { scopeCovers } from "@/domain/scope-match";
import { checklistOutcome, evaluateChecklist, type ChecklistKey } from "@/domain/verification-checklist";
import type { Contact } from "@/domain/vendor-schemas";
import { UserError } from "@/server/errors";
import { notify } from "@/server/notify/notifier";
import { currentTenant, type TenantClient, type TenantTx } from "@/server/tenant";
import { changeRequestStatus } from "./calibration-requests";
import { moveJob } from "./calibration-jobs";
import { changeInstrumentStatus, recordEvent } from "./instruments";
import { toScopeRow } from "./vendors";

export const verificationInclude = {
  instrument: {
    select: {
      id: true,
      code: true,
      status: true,
      serialNo: true,
      description: true,
      nablRequired: true,
      rangeMin: true,
      rangeMax: true,
      unit: true,
      tolerancePlus: true,
      toleranceMinus: true,
      acceptanceCriteria: true,
      lastCalibratedAt: true,
      nextDueAt: true,
      frequencyValue: true,
      frequencyUnit: true,
      standardCode: true,
      standardDate: true,
      type: { select: { name: true, parameter: true, defaultTolerance: true, standardCode: true, standardDate: true } },
      plant: { select: { code: true, name: true } },
    },
  },
  vendor: { select: { id: true, name: true, accreditationType: true, nablCertNo: true, nablValidUntil: true, contacts: true } },
  poItem: { select: { poId: true, po: { select: { number: true } } } },
  challanItem: { select: { challan: { select: { number: true } } } },
  readings: { orderBy: { position: "asc" as const } },
  ootCases: { select: { id: true, status: true } },
} as const;

export type VerifyInput = {
  certificateNo: string;
  ulrNo: string;
  calibratedAt: Date;
  labAccreditationNo: string;
  nablMarkPresent: boolean | null;
  uncertaintyStated: boolean | null;
  /** Verifier's confirmation, used only when the lab has no scope rows on file to check automatically. */
  scopeConfirmed: boolean | null;
  readings: ReadingInput[];
};

/** Is the instrument's parameter/range within the lab's accredited scope? (null = no scope data → verifier confirms) */
export async function scopeCheck(
  tx: Pick<TenantClient, "vendorScope">,
  vendorId: string | null,
  i: {
    rangeMin: { toNumber(): number } | null;
    rangeMax: { toNumber(): number } | null;
    unit: string | null;
    type: { parameter: string | null };
  },
) {
  if (!vendorId) return true as boolean | null; // in-house
  const scopes = (
    await tx.vendorScope.findMany({
      where: { vendorId, archivedAt: null },
      select: { vendorId: true, parameter: true, rangeMin: true, rangeMax: true, unit: true },
    })
  ).map(toScopeRow);
  if (!scopes.length) return null;
  return scopes.some((s) =>
    scopeCovers(s, {
      parameter: i.type.parameter,
      rangeMin: i.rangeMin?.toNumber() ?? null,
      rangeMax: i.rangeMax?.toNumber() ?? null,
      unit: i.unit,
    }),
  );
}

export function checklistFor(
  job: {
    sentAt: Date | null;
    receivedAt: Date | null;
    instrument: { nablRequired: boolean };
    vendor: { accreditationType: string; nablCertNo: string | null } | null;
  },
  input: Omit<VerifyInput, "readings"> & { autoScope: boolean | null; readingsResult: "PASS" | "FAIL" | null },
) {
  return evaluateChecklist({
    nablRequired: job.instrument.nablRequired,
    certificateNo: input.certificateNo,
    ulrNo: input.ulrNo,
    calibratedAt: input.calibratedAt,
    sentAt: job.sentAt,
    receivedAt: job.receivedAt,
    nablMarkPresent: input.nablMarkPresent,
    labAccreditationNo: input.labAccreditationNo,
    vendorNablCertNo: job.vendor?.nablCertNo ?? null,
    vendorIsNabl: job.vendor?.accreditationType === "NABL",
    withinScope: input.autoScope ?? input.scopeConfirmed,
    uncertaintyStated: input.uncertaintyStated,
    readingsResult: input.readingsResult,
  });
}

export type VerifyResult = { result: "PASS" | "FAIL"; ootCaseId: string | null; nextDueAt: Date | null };

/**
 * The verifier's decision. PASS → instrument back in store with new calibration/due dates; FAIL →
 * instrument on hold and an OOT case. An as-found failure on a PASS opens an assessment-only OOT case.
 * The verifier (current actor) is recorded; AI prefill never decides.
 */
export async function verifyJob(tx: TenantTx, jobId: string, input: VerifyInput, now = new Date()): Promise<VerifyResult> {
  const { organizationId, actorId } = currentTenant();
  const job = await tx.calibrationJob.findUniqueOrThrow({ where: { id: jobId }, include: verificationInclude });
  if (job.status !== "CERT_UPLOADED") throw new UserError("This job isn't waiting for verification");
  if (job.instrument.status !== "RECEIVED_PENDING_VERIFICATION")
    throw new UserError(`${job.instrument.code} must be received back before verification`);

  const computed = input.readings.map(computeReading);
  const overall = overallResult(computed);
  const autoScope = await scopeCheck(tx, job.vendorId, job.instrument);
  const withinScope = autoScope ?? input.scopeConfirmed;
  const items = checklistFor(job, { ...input, autoScope, readingsResult: overall.result });
  const outcome = checklistOutcome(items);
  if (outcome.mustReject)
    throw new UserError(
      `The certificate has problems (${outcome.documentFailures.map(label).join(", ")}). Reject it back to the lab instead.`,
    );
  if (!outcome.canDecide) throw new UserError(`Complete the checklist: ${outcome.pending.map(label).join(", ")}`);

  await tx.calibrationReading.createMany({
    data: computed.map((r, position) => ({
      organizationId,
      jobId,
      position,
      pointLabel: r.pointLabel,
      nominal: r.nominal,
      asFound: r.asFound,
      asLeft: r.asLeft,
      error: r.error,
      permissibleError: r.permissibleError,
      uncertainty: r.uncertainty,
      pass: r.pass,
      asFoundPass: r.asFoundPass,
    })),
  });

  const nextDueAt =
    overall.result === "PASS"
      ? computeNextDue(input.calibratedAt, job.instrument.frequencyValue, job.instrument.frequencyUnit)
      : null;
  await tx.calibrationJob.update({
    where: { id: jobId },
    data: {
      certificateNo: input.certificateNo.trim(),
      ulrNo: input.ulrNo.trim() || null,
      nablMarkPresent: input.nablMarkPresent,
      labAccreditationNo: input.labAccreditationNo.trim() || null,
      calibratedAt: input.calibratedAt,
      result: overall.result,
      nextDueAt,
      verifiedById: actorId,
      verifiedAt: now,
      // the standard in force today, kept with the record even if the type/instrument standard is revised later
      standardCode: effectiveStandard(job.instrument).standardCode,
      standardDate: effectiveStandard(job.instrument).standardDate,
      verificationChecklist: {
        items,
        uncertaintyStated: input.uncertaintyStated,
        withinScope,
        failedPoints: overall.failedPoints,
        asFoundFailed: overall.asFoundFailed,
        anyMarginal: overall.anyMarginal,
      },
    },
  });

  let ootCaseId: string | null = null;
  const previousCalibration = job.instrument.lastCalibratedAt;
  if (overall.result === "PASS") {
    await tx.instrument.update({ where: { id: job.instrument.id }, data: { lastCalibratedAt: input.calibratedAt, nextDueAt } });
    await changeInstrumentStatus(tx, job.instrument.id, "IN_STORE");
    await moveJob(tx, jobId, "VERIFIED_PASS");
    await moveJob(tx, jobId, "CLOSED");
    await recordEvent(tx, job.instrument.id, "CALIBRATED", {
      result: "PASS",
      certificateNo: input.certificateNo,
      vendor: job.vendor?.name ?? null,
      nextDueAt: nextDueAt?.toISOString() ?? null,
    });
    if (overall.asFoundFailed) ootCaseId = await openOot(tx, job, "AS_FOUND_FAIL", previousCalibration);
  } else {
    await changeInstrumentStatus(tx, job.instrument.id, "ON_HOLD_OOT");
    await moveJob(tx, jobId, "VERIFIED_FAIL");
    await recordEvent(tx, job.instrument.id, "OOT", { certificateNo: input.certificateNo, failedPoints: overall.failedPoints });
    ootCaseId = await openOot(tx, job, "AS_LEFT_FAIL", previousCalibration);
  }
  if (job.poItem) await closeIfComplete(tx, job.poItem.poId);
  return { result: overall.result, ootCaseId, nextDueAt };
}

const LABELS: Record<ChecklistKey, string> = {
  certificateNo: "certificate no.",
  ulrNo: "ULR no.",
  calibrationDate: "calibration date",
  nablMark: "NABL mark",
  accreditationMatches: "lab accreditation no.",
  withinScope: "lab scope",
  uncertaintyStated: "uncertainty",
  resultsWithinTolerance: "readings",
};
const label = (k: ChecklistKey) => LABELS[k];

async function openOot(
  tx: TenantTx,
  job: { id: string; plantId: string; instrument: { id: string; code: string }; vendor: { name: string } | null },
  trigger: "AS_LEFT_FAIL" | "AS_FOUND_FAIL",
  lastGood: Date | null,
) {
  const { organizationId } = currentTenant();
  const c = await tx.ootCase.create({
    data: {
      organizationId,
      plantId: job.plantId,
      jobId: job.id,
      instrumentId: job.instrument.id,
      trigger,
      lastGoodCalibrationAt: lastGood,
    },
  });
  const heads = await tx.membership.findMany({
    where: { archivedAt: null, role: "QUALITY_HEAD", OR: [{ plantId: null }, { plantId: job.plantId }] },
    select: { user: { select: { id: true, email: true, phone: true, name: true } } },
  });
  const to = heads.flatMap((h) => [
    { channel: "EMAIL" as const, recipient: h.user.email, userId: h.user.id },
    ...(h.user.phone ? [{ channel: "WHATSAPP" as const, recipient: h.user.phone, userId: h.user.id }] : []),
  ]);
  if (to.length) {
    await notify(tx, {
      template: "oot.opened",
      payload: {
        code: job.instrument.code,
        trigger,
        lab: job.vendor?.name ?? "In-house",
        url: `${process.env.APP_URL ?? "http://localhost:3000"}/oot/${c.id}`,
      },
      to,
    });
  }
  return c.id;
}

/** PO → CLOSED once every instrument on it is verified; request → CLOSED once all its POs are closed. */
export async function closeIfComplete(tx: TenantTx, poId: string) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: { items: { include: { job: { select: { status: true } } } } },
  });
  const done = po.items.every((i) => i.job && ["VERIFIED_PASS", "VERIFIED_FAIL", "CLOSED", "CANCELLED"].includes(i.job.status));
  if (!done || !["SENT", "ACKNOWLEDGED"].includes(po.status)) return;
  await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "CLOSED" } });
  if (!po.requestId) return;
  const req = await tx.calibrationRequest.findUniqueOrThrow({
    where: { id: po.requestId },
    include: { purchaseOrders: { select: { status: true } } },
  });
  if (req.status === "PO_RAISED" && req.purchaseOrders.every((p) => p.status === "CLOSED" || p.status === "CANCELLED"))
    await changeRequestStatus(tx, req.id, "CLOSED");
}

/** Certificate is defective (wrong lab accreditation, missing ULR, wrong instrument…) → back to the lab. */
export async function rejectCertificate(tx: TenantTx, jobId: string, reason: string, now = new Date()) {
  if (reason.trim().length < 5) throw new UserError("Explain what's wrong with the certificate");
  const job = await tx.calibrationJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      instrument: { select: { id: true, code: true } },
      vendor: {
        select: {
          name: true,
          contacts: true,
          users: { where: { archivedAt: null }, select: { user: { select: { email: true } } } },
        },
      },
    },
  });
  if (job.status !== "CERT_UPLOADED") throw new UserError("Only uploaded certificates can be rejected");
  await moveJob(tx, jobId, "RETURNED", { certificateFileId: null, certRejectedAt: now, certRejectionReason: reason.trim() });
  await recordEvent(tx, job.instrument.id, "EDITED", { certificateRejected: reason.trim() });
  const emails = new Set([
    ...((job.vendor?.contacts ?? []) as Contact[]).map((c) => c.email).filter((e): e is string => !!e),
    ...(job.vendor?.users.map((u) => u.user.email) ?? []),
  ]);
  if (emails.size) {
    await notify(tx, {
      template: "cert.rejected",
      payload: {
        code: job.instrument.code,
        reason: reason.trim(),
        lab: job.vendor?.name ?? "",
        url: `${process.env.APP_URL ?? "http://localhost:3000"}/vendor/certificates`,
      },
      to: [...emails].map((recipient) => ({ channel: "EMAIL" as const, recipient })),
    });
  }
}
