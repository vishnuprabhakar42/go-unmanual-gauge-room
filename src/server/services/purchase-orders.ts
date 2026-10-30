import { computeTotals, isInterState } from "@/domain/gst";
import { sequential } from "@/server/sequential";
import { PO_TRANSITIONS, assertTransition } from "@/domain/purchase-status";
import { parseOrgSettings } from "@/domain/settings";
import type { Contact } from "@/domain/vendor-schemas";
import { UserError } from "@/server/errors";
import { notify } from "@/server/notify/notifier";
import { nextDocNumber } from "@/server/number-series";
import { currentTenant, type TenantTx } from "@/server/tenant";
import { cancelJobsForPo, ensureJobsForPo } from "./calibration-jobs";

export type PoLine = {
  instrumentId: string;
  requestItemId: string | null;
  description: string;
  rate: number;
  gstPercent: number;
  tatDays: number;
  onsite?: boolean;
};

/** Creates a DRAFT PO with GST totals (intra/inter-state from vendor vs plant state). */
export async function createPurchaseOrder(
  tx: TenantTx,
  input: {
    plantId: string;
    vendorId: string;
    requestId: string | null;
    rfqId: string | null;
    source: "RATE_CONTRACT" | "RFQ";
    lines: PoLine[];
  },
) {
  const { organizationId } = currentTenant();
  if (!input.lines.length) throw new UserError("A PO needs at least one item");
  const [plant, vendor, org] = await sequential([
    tx.plant.findUniqueOrThrow({ where: { id: input.plantId } }),
    tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } }),
    tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } }),
  ]);
  const interState = isInterState(vendor.stateCode, plant.stateCode);
  const totals = computeTotals(input.lines, interState);
  const number = await nextDocNumber(tx, { plantId: plant.id, docType: "PO" });
  const sac = parseOrgSettings(org.settings).calibrationSac;
  const po = await tx.purchaseOrder.create({
    data: {
      organizationId,
      plantId: plant.id,
      vendorId: vendor.id,
      requestId: input.requestId,
      rfqId: input.rfqId,
      number,
      source: input.source,
      interState,
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      total: totals.total,
    },
  });
  await tx.purchaseOrderItem.createMany({
    data: input.lines.map((l) => ({
      organizationId,
      poId: po.id,
      instrumentId: l.instrumentId,
      requestItemId: l.requestItemId,
      description: l.description,
      sacCode: sac,
      rate: l.rate,
      gstPercent: l.gstPercent,
      tatDays: l.tatDays,
      onsite: l.onsite ?? false,
    })),
  });
  return po;
}

async function move(
  tx: TenantTx,
  id: string,
  to: "PENDING_APPROVAL" | "APPROVED" | "SENT" | "ACKNOWLEDGED" | "CLOSED" | "CANCELLED" | "DRAFT",
  extra: Record<string, unknown> = {},
) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
  try {
    assertTransition(PO_TRANSITIONS, po.status, to, "PO");
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  return tx.purchaseOrder.update({ where: { id }, data: { status: to, ...extra } });
}

export async function approvePurchaseOrder(tx: TenantTx, id: string) {
  const po = await move(tx, id, "APPROVED", { approvedById: currentTenant().actorId, approvedAt: new Date() });
  await ensureJobsForPo(tx, id); // one calibration job per instrument on the PO
  return po;
}

export async function cancelPurchaseOrder(tx: TenantTx, id: string) {
  const open = await tx.deliveryChallan.count({
    where: { poId: id, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] }, dispatchedAt: { not: null } },
  });
  if (open) throw new UserError("Instruments on this PO are already with the lab");
  await cancelJobsForPo(tx, id);
  return move(tx, id, "CANCELLED");
}

export async function acknowledgePurchaseOrder(tx: TenantTx, id: string) {
  return move(tx, id, "ACKNOWLEDGED");
}

/**
 * APPROVED → SENT, and emails the PO PDF to the vendor's contacts (queued; the worker renders the PDF
 * as an attachment). The PO also appears in the vendor portal (M5).
 */
export async function sendPurchaseOrder(tx: TenantTx, id: string, appUrl: string) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { vendor: true, plant: true } });
  const contacts = ((po.vendor.contacts ?? []) as Contact[]).filter((c) => c.email);
  await move(tx, id, "SENT", { sentAt: new Date() });
  const org = await tx.organization.findUniqueOrThrow({ where: { id: po.organizationId }, select: { name: true } });
  if (contacts.length) {
    await notify(tx, {
      template: "po.sent",
      payload: {
        poId: po.id,
        poNumber: po.number,
        orgName: org.name,
        plantName: po.plant.name,
        vendorName: po.vendor.name,
        total: po.total.toNumber(),
        appUrl,
      },
      to: contacts.map((c) => ({ channel: "EMAIL" as const, recipient: c.email! })),
    });
  }
  return { emailed: contacts.length };
}
