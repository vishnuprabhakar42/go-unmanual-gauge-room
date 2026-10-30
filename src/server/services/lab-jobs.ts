import { validateLabUpdate, type LabUpdate } from "@/domain/lab-progress";
import type { Prisma } from "@/generated/prisma/client";
import { UserError } from "@/server/errors";
import type { TenantClient, TenantTx } from "@/server/tenant";
import { moveJob } from "./calibration-jobs";

/** Lab-reported progress (portal, or internal team on the lab's behalf). */
export async function updateLabProgress(tx: TenantTx, jobId: string, u: LabUpdate, now = new Date()) {
  const job = await tx.calibrationJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { instrument: { select: { code: true } } },
  });
  const err = validateLabUpdate(job.status, job.labProgress, u);
  if (err) throw new UserError(`${job.instrument.code}: ${err}`);
  if (u.to === "RECEIVED_AT_LAB") await moveJob(tx, jobId, "AT_LAB", { atLabAt: now });
  await tx.calibrationJob.update({
    where: { id: jobId },
    data: {
      labProgress: u.to,
      labUpdatedAt: now,
      ...(u.to === "DISPATCHED_BACK"
        ? {
            returnCourier: u.returnCourier?.trim() || null,
            returnAwb: u.returnAwb?.trim() || null,
            returnNote: u.returnNote?.trim() || null,
          }
        : {}),
    },
  });
}

export const labJobInclude = {
  vendor: { select: { id: true, name: true } },
  instrument: {
    select: {
      id: true,
      code: true,
      serialNo: true,
      description: true,
      type: { select: { name: true } },
      plant: { select: { code: true } },
    },
  },
  poItem: { select: { po: { select: { id: true, number: true } } } },
  challanItem: { select: { challan: { select: { id: true, number: true, expectedReturnAt: true } } } },
} satisfies Prisma.CalibrationJobInclude;

/** Jobs out with labs or back awaiting a certificate — the shared "lab jobs" list. */
export function labJobsWhere(extra: Prisma.CalibrationJobWhereInput = {}): Prisma.CalibrationJobWhereInput {
  return { status: { in: ["DISPATCHED", "AT_LAB", "RETURNED", "CERT_UPLOADED"] }, vendorId: { not: null }, ...extra };
}

export async function listLabJobs(
  db: Pick<TenantClient, "calibrationJob">,
  opts: { plantId?: string | null; vendorId?: string } = {},
) {
  return db.calibrationJob.findMany({
    where: labJobsWhere({
      ...(opts.plantId ? { plantId: opts.plantId } : {}),
      ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
    }),
    include: labJobInclude,
    orderBy: [{ status: "asc" }, { sentAt: "asc" }],
    take: 1000,
  });
}
