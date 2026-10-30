import { createId } from "@paralleldrive/cuid2";
import { UserError } from "@/server/errors";
import { objectKey, storage } from "@/server/storage";
import { currentTenant, type TenantClient, type TenantTx } from "@/server/tenant";
import { moveJob } from "./calibration-jobs";
import { recordEvent } from "./instruments";

export const MAX_CERT_BYTES = 15 * 1024 * 1024;
/** Jobs that can take a certificate: the instrument has left (or is back) and verification hasn't happened. */
export const CERT_JOB_STATUSES = ["DISPATCHED", "AT_LAB", "RETURNED", "CERT_UPLOADED"] as const;

export function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

/**
 * Stores a certificate PDF and links it to the job. RETURNED → CERT_UPLOADED; if the instrument is
 * still at the lab, the job moves to CERT_UPLOADED on inward receipt. Re-uploading keeps the old file
 * as history (attachments are never deleted) and points the job at the new one.
 */
export async function attachCertificate(tx: TenantTx, jobId: string, file: { name: string; bytes: Buffer }) {
  const { organizationId, actorId } = currentTenant();
  if (file.bytes.length === 0 || file.bytes.length > MAX_CERT_BYTES)
    throw new UserError(`${file.name}: file must be a PDF up to 15 MB`);
  if (!isPdf(file.bytes)) throw new UserError(`${file.name}: not a PDF`);
  const job = await tx.calibrationJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { instrument: { select: { id: true, code: true } } },
  });
  if (!(CERT_JOB_STATUSES as readonly string[]).includes(job.status))
    throw new UserError(`${job.instrument.code}: job is ${job.status.toLowerCase()} — certificates can't be attached now`);

  const id = createId();
  const fileKey = objectKey(organizationId, "certificates", file.name, id);
  await storage().put({ key: fileKey, body: file.bytes, contentType: "application/pdf" });
  const attachment = await tx.attachment.create({
    data: {
      id,
      organizationId,
      entityType: "CalibrationJob",
      entityId: jobId,
      fileKey,
      fileName: file.name,
      mime: "application/pdf",
      size: file.bytes.length,
      uploadedBy: actorId,
    },
  });
  await tx.calibrationJob.update({ where: { id: jobId }, data: { certificateFileId: attachment.id } });
  if (job.status === "RETURNED") await moveJob(tx, jobId, "CERT_UPLOADED");
  await recordEvent(tx, job.instrument.id, "EDITED", { certificate: file.name });
  return { attachmentId: attachment.id, code: job.instrument.code };
}

/** Short-lived signed URL for an attachment visible to this tenant. */
export async function attachmentUrl(db: Pick<TenantClient, "attachment">, attachmentId: string, expiresInSec = 600) {
  const a = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!a || a.archivedAt) return null;
  return storage().signedUrl(a.fileKey, { expiresInSec, fileName: a.fileName, contentType: a.mime });
}
