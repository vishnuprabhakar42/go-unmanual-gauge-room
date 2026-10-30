import { prefillFromExtraction, type Prefill } from "@/domain/cert-extraction";
import { permissibleFromTolerance } from "@/domain/readings";
import type { Prisma } from "@/generated/prisma/client";
import { aiCertExtractionEnabled, certExtractor } from "@/server/ai/cert-extraction";
import { UserError } from "@/server/errors";
import { storage } from "@/server/storage";
import { withTenantTx, type TenantClient, type TenantContext } from "@/server/tenant";

/**
 * Runs AI extraction on the job's certificate and stores the raw output (aiExtraction/aiConfidence)
 * for audit. The model call happens outside any DB transaction. Returns the form prefill.
 */
export async function extractCertificate(ctx: TenantContext, db: TenantClient, jobId: string): Promise<Prefill | null> {
  if (!aiCertExtractionEnabled()) throw new UserError("AI extraction is turned off");
  const job = await db.calibrationJob.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      certificateFileId: true,
      instrument: {
        select: {
          serialNo: true,
          tolerancePlus: true,
          acceptanceCriteria: true,
          rangeMin: true,
          rangeMax: true,
          type: { select: { defaultTolerance: true } },
        },
      },
    },
  });
  if (!job || job.status !== "CERT_UPLOADED" || !job.certificateFileId)
    throw new UserError("No certificate waiting for verification");
  const file = await db.attachment.findUniqueOrThrow({ where: { id: job.certificateFileId } });
  const extraction = await certExtractor()(await storage().get(file.fileKey));
  if (!extraction) return null;
  const prefill = prefillFromExtraction(extraction, {
    instrumentSerial: job.instrument.serialNo,
    defaultPermissible:
      job.instrument.tolerancePlus?.toNumber() ??
      permissibleFromTolerance(job.instrument.acceptanceCriteria ?? job.instrument.type.defaultTolerance, {
        min: job.instrument.rangeMin?.toNumber() ?? null,
        max: job.instrument.rangeMax?.toNumber() ?? null,
      }),
  });
  await withTenantTx(ctx, (tx) =>
    tx.calibrationJob.update({
      where: { id: jobId },
      data: {
        aiExtraction: {
          ...extraction,
          model: process.env.AI_MODEL ?? null,
          extractedAt: new Date().toISOString(),
          fileId: file.id,
        } as Prisma.InputJsonValue,
        aiConfidence: prefill.overallConfidence,
      },
    }),
  );
  return prefill;
}
