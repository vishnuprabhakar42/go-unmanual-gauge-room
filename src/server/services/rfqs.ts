import { RFQ_TRANSITIONS, assertTransition } from "@/domain/purchase-status";
import { UserError } from "@/server/errors";
import { currentTenant, type TenantTx } from "@/server/tenant";
import { changeRequestStatus, describeInstrument } from "./calibration-requests";
import { createPurchaseOrder } from "./purchase-orders";
import { notifyRfqInvites } from "./vendor-users";

async function openRfq(tx: TenantTx, rfqId: string) {
  const rfq = await tx.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  if (rfq.status !== "OPEN" && rfq.status !== "CLOSED") throw new UserError(`RFQ is ${rfq.status.toLowerCase()}`);
  return rfq;
}

export async function inviteVendors(tx: TenantTx, rfqId: string, vendorIds: string[]) {
  const { organizationId } = currentTenant();
  await openRfq(tx, rfqId);
  const linked = await tx.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true } }); // only linked labs
  const existing = new Set(
    (await tx.rfqVendor.findMany({ where: { rfqId }, select: { vendorId: true } })).map((v) => v.vendorId),
  );
  const add = linked.map((v) => v.id).filter((id) => !existing.has(id));
  if (add.length) {
    await tx.rfqVendor.createMany({ data: add.map((vendorId) => ({ organizationId, rfqId, vendorId })) });
    await notifyRfqInvites(tx, rfqId, add, process.env.APP_URL ?? "http://localhost:3000");
  }
  return add.length;
}

export type QuoteLine = {
  requestItemId: string;
  rate: number;
  gstPercent: number;
  tatDays: number;
  nablInScope: boolean;
  technicalRemarks?: string | null;
};

/** Purchase keys a vendor's quote (the vendor portal does the same in M5). Re-saving replaces the lines and resets tech review. */
export async function saveQuote(
  tx: TenantTx,
  rfqId: string,
  vendorId: string,
  input: { lines: QuoteLine[]; validUntil: Date | null; remarks: string | null },
) {
  const { organizationId, actorId } = currentTenant();
  const rfq = await openRfq(tx, rfqId);
  const invited = await tx.rfqVendor.findUnique({ where: { rfqId_vendorId: { rfqId, vendorId } } });
  if (!invited) throw new UserError("Invite the vendor to this RFQ first");
  const validItems = new Set(
    (
      await tx.calibrationRequestItem.findMany({
        where: { requestId: rfq.requestId, removedAt: null, sourcing: "RFQ" },
        select: { id: true },
      })
    ).map((i) => i.id),
  );
  const lines = input.lines.filter((l) => validItems.has(l.requestItemId));
  if (!lines.length) throw new UserError("Enter a rate for at least one instrument");

  const existing = await tx.quote.findUnique({ where: { rfqId_vendorId: { rfqId, vendorId } } });
  const quote = existing
    ? await tx.quote.update({
        where: { id: existing.id },
        data: {
          status: "SUBMITTED",
          validUntil: input.validUntil,
          remarks: input.remarks,
          enteredById: actorId,
          techReviewedById: null,
          techReviewedAt: null,
          techRemarks: null,
        },
      })
    : await tx.quote.create({
        data: { organizationId, rfqId, vendorId, validUntil: input.validUntil, remarks: input.remarks, enteredById: actorId },
      });

  const current = await tx.quoteItem.findMany({ where: { quoteId: quote.id } });
  const byItem = new Map(current.map((c) => [c.requestItemId, c]));
  for (const l of lines) {
    const data = {
      rate: l.rate,
      gstPercent: l.gstPercent,
      tatDays: l.tatDays,
      nablInScope: l.nablInScope,
      technicalRemarks: l.technicalRemarks ?? null,
    };
    const prev = byItem.get(l.requestItemId);
    if (prev) await tx.quoteItem.update({ where: { id: prev.id }, data });
    else await tx.quoteItem.create({ data: { organizationId, quoteId: quote.id, requestItemId: l.requestItemId, ...data } });
  }
  return quote;
}

/** Gauge in-charge / quality head: technical OK or not OK for a vendor's quote. */
export async function reviewQuote(tx: TenantTx, quoteId: string, approved: boolean, remarks: string | null) {
  const quote = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
  await openRfq(tx, quote.rfqId);
  if (!approved && !remarks?.trim()) throw new UserError("Give a reason when rejecting a quote technically");
  await tx.quote.update({
    where: { id: quoteId },
    data: {
      status: approved ? "TECH_APPROVED" : "TECH_REJECTED",
      techReviewedById: currentTenant().actorId,
      techReviewedAt: new Date(),
      techRemarks: remarks,
    },
  });
}

/**
 * Purchase awards each RFQ item to one technically approved quote line, then one draft PO is raised per
 * winning vendor. Quotes become AWARDED/LOST, the RFQ AWARDED, and the request PO_RAISED.
 */
export async function awardRfq(tx: TenantTx, rfqId: string, awards: Record<string, string>) {
  const rfq = await openRfq(tx, rfqId);
  const rfqItems = await tx.calibrationRequestItem.findMany({
    where: { requestId: rfq.requestId, removedAt: null, sourcing: "RFQ" },
    include: {
      instrument: {
        select: {
          id: true,
          code: true,
          description: true,
          rangeMin: true,
          rangeMax: true,
          unit: true,
          type: { select: { name: true } },
        },
      },
    },
  });
  const missing = rfqItems.filter((i) => !awards[i.id]);
  if (missing.length) throw new UserError(`Choose a vendor for every instrument (${missing.length} left)`);

  const lines = await tx.quoteItem.findMany({ where: { id: { in: Object.values(awards) } }, include: { quote: true } });
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const byVendor = new Map<string, { item: (typeof rfqItems)[number]; line: (typeof lines)[number] }[]>();
  for (const item of rfqItems) {
    const line = lineById.get(awards[item.id]);
    if (!line || line.requestItemId !== item.id || line.quote.rfqId !== rfqId)
      throw new UserError(`Invalid award for ${item.instrument.code}`);
    if (line.quote.status !== "TECH_APPROVED")
      throw new UserError(`${item.instrument.code}: the chosen quote is not technically approved`);
    byVendor.set(line.quote.vendorId, [...(byVendor.get(line.quote.vendorId) ?? []), { item, line }]);
  }

  const created: { id: string; number: string }[] = [];
  for (const [vendorId, rows] of byVendor) {
    const po = await createPurchaseOrder(tx, {
      plantId: rfq.plantId,
      vendorId,
      requestId: rfq.requestId,
      rfqId,
      source: "RFQ",
      lines: rows.map(({ item, line }) => ({
        instrumentId: item.instrument.id,
        requestItemId: item.id,
        description: describeInstrument(item.instrument),
        rate: line.rate.toNumber(),
        gstPercent: line.gstPercent.toNumber(),
        tatDays: line.tatDays,
      })),
    });
    created.push({ id: po.id, number: po.number });
    await tx.calibrationRequestItem.updateMany({
      where: { id: { in: rows.map((r) => r.item.id) } },
      data: { proposedVendorId: vendorId },
    });
  }

  await tx.quoteItem.updateMany({ where: { id: { in: Object.values(awards) } }, data: { awarded: true } });
  const winners = new Set(byVendor.keys());
  const quotes = await tx.quote.findMany({ where: { rfqId } });
  for (const q of quotes)
    await tx.quote.update({ where: { id: q.id }, data: { status: winners.has(q.vendorId) ? "AWARDED" : "LOST" } });
  assertTransition(RFQ_TRANSITIONS, rfq.status, "AWARDED", "RFQ");
  await tx.rfq.update({ where: { id: rfqId }, data: { status: "AWARDED" } });
  const req = await tx.calibrationRequest.findUniqueOrThrow({ where: { id: rfq.requestId } });
  if (req.status === "SOURCING") await changeRequestStatus(tx, req.id, "PO_RAISED");
  return created;
}

export async function setRfqStatus(tx: TenantTx, rfqId: string, to: "OPEN" | "CLOSED" | "CANCELLED") {
  const rfq = await tx.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  try {
    assertTransition(RFQ_TRANSITIONS, rfq.status, to, "RFQ");
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  await tx.rfq.update({ where: { id: rfqId }, data: { status: to } });
}
