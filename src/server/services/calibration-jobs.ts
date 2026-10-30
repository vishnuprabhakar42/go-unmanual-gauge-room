import { assertJobTransition, type JobStatus } from "@/domain/calibration-job-status";
import type { Prisma } from "@/generated/prisma/client";
import { currentTenant, type TenantTx } from "@/server/tenant";

/** One PO_RAISED job per PO item (idempotent). Called when a PO is approved; backfills older POs. */
export async function ensureJobsForPo(tx: TenantTx, poId: string) {
  const { organizationId } = currentTenant();
  const po = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: { items: { include: { job: { select: { id: true } } } } },
  });
  const missing = po.items.filter((i) => !i.job);
  if (missing.length) {
    await tx.calibrationJob.createMany({
      data: missing.map((i) => ({
        organizationId,
        plantId: po.plantId,
        instrumentId: i.instrumentId,
        vendorId: po.vendorId,
        poItemId: i.id,
        status: "PO_RAISED" as const,
      })),
    });
  }
  return missing.length;
}

/** The only way to change a job's status (state machine enforced). */
export async function moveJob(tx: TenantTx, jobId: string, to: JobStatus, data: Prisma.CalibrationJobUncheckedUpdateInput = {}) {
  const job = await tx.calibrationJob.findUniqueOrThrow({ where: { id: jobId } });
  assertJobTransition(job.status, to, { inHouse: !job.vendorId });
  return tx.calibrationJob.update({ where: { id: jobId }, data: { ...data, status: to } });
}

/** PO cancelled before dispatch → its open jobs are cancelled. */
export async function cancelJobsForPo(tx: TenantTx, poId: string) {
  const jobs = await tx.calibrationJob.findMany({
    where: { poItem: { poId }, status: { in: ["PLANNED", "PO_RAISED"] } },
    select: { id: true },
  });
  for (const j of jobs) await moveJob(tx, j.id, "CANCELLED");
}
