import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { acknowledgePurchaseOrder } from "@/server/services/purchase-orders";
import { attachCertificate } from "@/server/services/certificates";
import { labJobInclude, labJobsWhere, updateLabProgress } from "@/server/services/lab-jobs";
import { saveQuote, type QuoteLine } from "@/server/services/rfqs";
import type { LabUpdate } from "@/domain/lab-progress";
import { vendorScope, withVendorTx, type VendorContext } from "./scope";

// ───────────── Reads (always through vendorScope) ─────────────

export async function portalSummary(ctx: VendorContext) {
  const scope = vendorScope(ctx);
  const [rfqs, posToAck, atLab, needCert] = await Promise.all([
    prisma.rfqVendor.count({
      where: { ...scope, rfq: { status: "OPEN", quotes: { none: { vendorId: { in: ctx.vendors.map((v) => v.id) } } } } },
    }),
    prisma.purchaseOrder.count({ where: { ...scope, status: "SENT" } }),
    prisma.calibrationJob.count({ where: { ...scope, status: { in: ["DISPATCHED", "AT_LAB"] } } }),
    prisma.calibrationJob.count({
      where: { ...scope, status: { in: ["DISPATCHED", "AT_LAB", "RETURNED"] }, certificateFileId: null },
    }),
  ]);
  return { rfqs, posToAck, atLab, needCert };
}

export async function portalRfqs(ctx: VendorContext) {
  return prisma.rfqVendor.findMany({
    where: { ...vendorScope(ctx), rfq: { status: { in: ["OPEN", "CLOSED", "AWARDED"] } } },
    include: {
      vendor: { select: { name: true } },
      rfq: {
        select: {
          id: true,
          number: true,
          dueAt: true,
          status: true,
          organizationId: true,
          organization: { select: { name: true } },
          quotes: { select: { vendorId: true, status: true } },
        },
      },
    },
    orderBy: { invitedAt: "desc" },
    take: 200,
  });
}

/** The RFQ as one invited lab sees it: only the RFQ items and that lab's own quote. */
export async function portalRfq(ctx: VendorContext, rfqId: string) {
  const invite = await prisma.rfqVendor.findFirst({
    where: { ...vendorScope(ctx), rfqId },
    include: { vendor: { select: { id: true, name: true } } },
  });
  if (!invite) return null;
  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId }, include: { organization: { select: { name: true } } } });
  const [items, quote, plant] = await Promise.all([
    prisma.calibrationRequestItem.findMany({
      where: { requestId: rfq.requestId, removedAt: null, sourcing: "RFQ" },
      include: {
        instrument: {
          select: {
            code: true,
            description: true,
            make: true,
            model: true,
            rangeMin: true,
            rangeMax: true,
            unit: true,
            leastCount: true,
            nablRequired: true,
            type: { select: { name: true, parameter: true } },
          },
        },
      },
      orderBy: { dueAt: { sort: "asc", nulls: "last" } },
    }),
    prisma.quote.findUnique({ where: { rfqId_vendorId: { rfqId, vendorId: invite.vendorId } }, include: { items: true } }),
    prisma.plant.findUniqueOrThrow({ where: { id: rfq.plantId }, select: { name: true, address: true } }),
  ]);
  if (!invite.viewedAt) await prisma.rfqVendor.update({ where: { id: invite.id }, data: { viewedAt: new Date() } }); // view receipt (not a business change)
  return { invite, rfq, items, quote, plant };
}

export async function portalOrders(ctx: VendorContext) {
  return prisma.purchaseOrder.findMany({
    where: { ...vendorScope(ctx), status: { in: ["SENT", "ACKNOWLEDGED", "CLOSED"] } },
    include: {
      organization: { select: { name: true } },
      plant: { select: { name: true } },
      vendor: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { sentAt: "desc" },
    take: 200,
  });
}

export async function portalOrder(ctx: VendorContext, poId: string) {
  return prisma.purchaseOrder.findFirst({
    where: { ...vendorScope(ctx), id: poId, status: { in: ["SENT", "ACKNOWLEDGED", "CLOSED"] } },
    include: {
      organization: { select: { name: true } },
      plant: true,
      vendor: { select: { name: true } },
      items: { include: { instrument: { select: { code: true, serialNo: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function portalJobs(ctx: VendorContext) {
  return prisma.calibrationJob.findMany({
    where: { ...vendorScope(ctx), ...labJobsWhere() },
    include: { ...labJobInclude, organization: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { sentAt: "asc" }],
    take: 1000,
  });
}

async function scopedJob(ctx: VendorContext, jobId: string) {
  const job = await prisma.calibrationJob.findFirst({
    where: { ...vendorScope(ctx), id: jobId },
    select: { id: true, organizationId: true },
  });
  if (!job) throw new UserError("Not available to this lab");
  return job;
}

// ───────────── Writes (in the customer org's audited transaction) ─────────────

export async function portalSubmitQuote(
  ctx: VendorContext,
  rfqId: string,
  input: { lines: QuoteLine[]; validUntil: Date | null; remarks: string | null },
) {
  const invite = await prisma.rfqVendor.findFirst({ where: { ...vendorScope(ctx), rfqId } });
  if (!invite) throw new UserError("Not available to this lab");
  return withVendorTx(ctx, invite.organizationId, (tx) => saveQuote(tx, rfqId, invite.vendorId, input));
}

export async function portalAcknowledgePo(ctx: VendorContext, poId: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { ...vendorScope(ctx), id: poId },
    select: { id: true, organizationId: true },
  });
  if (!po) throw new UserError("Not available to this lab");
  return withVendorTx(ctx, po.organizationId, (tx) => acknowledgePurchaseOrder(tx, poId));
}

export async function portalUpdateJob(ctx: VendorContext, jobId: string, u: LabUpdate) {
  const job = await scopedJob(ctx, jobId);
  return withVendorTx(ctx, job.organizationId, (tx) => updateLabProgress(tx, jobId, u));
}

export async function portalUploadCertificate(ctx: VendorContext, jobId: string, file: { name: string; bytes: Buffer }) {
  const job = await scopedJob(ctx, jobId);
  return withVendorTx(ctx, job.organizationId, (tx) => attachCertificate(tx, jobId, file));
}

/** Signed URL for a PO PDF or a certificate the lab may see. */
export async function portalCanSeePo(ctx: VendorContext, poId: string) {
  return portalOrder(ctx, poId);
}

/** Signed URL for a certificate on one of the lab's jobs. */
export async function portalAttachmentUrl(ctx: VendorContext, attachmentId: string) {
  const a = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!a || a.archivedAt || a.entityType !== "CalibrationJob") return null;
  const job = await prisma.calibrationJob.findFirst({ where: { ...vendorScope(ctx), id: a.entityId }, select: { id: true } });
  if (!job) return null;
  const { storage } = await import("@/server/storage");
  return storage().signedUrl(a.fileKey, { expiresInSec: 600, fileName: a.fileName, contentType: a.mime });
}
