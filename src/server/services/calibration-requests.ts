import {
  OPEN_REQUEST_STATUSES,
  assertRequestTransition,
  isEditable,
  type RequestStatus,
} from "@/domain/calibration-request-status";
import { startOfIstDay } from "@/domain/due";
import { contractInForce } from "@/domain/purchase-status";
import { coveringVendorIds, scopeCovers } from "@/domain/scope-match";
import { parseOrgSettings } from "@/domain/settings";
import { selectVendor } from "@/domain/vendor-selection";
import { UserError } from "@/server/errors";
import { nextDocNumber } from "@/server/number-series";
import { currentTenant, type TenantTx } from "@/server/tenant";
import { createPurchaseOrder } from "./purchase-orders";
import { contractRatesByType } from "./rate-contracts";
import { notifyRfqInvites } from "./vendor-users";
import { toScopeRow } from "./vendors";

/** Statuses from which an instrument can be put on a calibration request. */
const REQUESTABLE = ["IN_STORE", "IN_USE"] as const;

export type CreatedRequests = {
  requests: { id: string; number: string; plantCode: string; items: number }[];
  skipped: { code: string; reason: string }[];
};

/**
 * "Create calibration request from selection": one DRAFT request per plant (numbers are per plant).
 * Instruments already on an open request, or not in store/in use, are skipped and reported.
 */
export async function createRequestsFromSelection(
  tx: TenantTx,
  instrumentIds: string[],
  notes?: string | null,
): Promise<CreatedRequests> {
  const { organizationId, actorId } = currentTenant();
  if (!actorId) throw new Error("A user is required to raise a request");
  const instruments = await tx.instrument.findMany({
    where: { id: { in: instrumentIds }, archivedAt: null },
    select: {
      id: true,
      code: true,
      status: true,
      plantId: true,
      nextDueAt: true,
      plant: { select: { code: true } },
      requestItems: {
        where: { removedAt: null, request: { status: { in: [...OPEN_REQUEST_STATUSES] } } },
        select: { request: { select: { number: true } } },
      },
    },
  });

  const skipped: CreatedRequests["skipped"] = [];
  const byPlant = new Map<string, typeof instruments>();
  for (const i of instruments) {
    if (i.requestItems.length) skipped.push({ code: i.code, reason: `Already on ${i.requestItems[0].request.number}` });
    else if (!(REQUESTABLE as readonly string[]).includes(i.status))
      skipped.push({ code: i.code, reason: `Status is ${i.status}` });
    else byPlant.set(i.plantId, [...(byPlant.get(i.plantId) ?? []), i]);
  }
  const missing = instrumentIds.length - instruments.length;
  if (missing > 0) skipped.push({ code: `${missing} instrument(s)`, reason: "Not found or archived" });

  const requests: CreatedRequests["requests"] = [];
  for (const [plantId, items] of byPlant) {
    const dues = items
      .map((i) => i.nextDueAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime());
    const number = await nextDocNumber(tx, { plantId, docType: "CR" });
    const req = await tx.calibrationRequest.create({
      data: {
        organizationId,
        plantId,
        number,
        requestedById: actorId,
        status: "DRAFT",
        dueWindowFrom: dues[0] ?? null,
        dueWindowTo: dues[dues.length - 1] ?? null,
        notes: notes ?? null,
      },
    });
    await tx.calibrationRequestItem.createMany({
      data: items.map((i) => ({ organizationId, requestId: req.id, instrumentId: i.id, dueAt: i.nextDueAt })),
    });
    await assignVendors(tx, req.id);
    requests.push({ id: req.id, number, plantCode: items[0].plant.code, items: items.length });
  }
  return { requests, skipped };
}

export async function removeRequestItem(tx: TenantTx, itemId: string) {
  const item = await tx.calibrationRequestItem.findUniqueOrThrow({ where: { id: itemId }, include: { request: true } });
  if (!isEditable(item.request.status)) throw new UserError("Only draft requests can be changed");
  // Scope check: the request must be visible to this user (plant scope)
  await tx.calibrationRequest.findUniqueOrThrow({ where: { id: item.requestId } });
  await tx.calibrationRequestItem.update({ where: { id: itemId }, data: { removedAt: new Date() } });
}

export async function changeRequestStatus(tx: TenantTx, id: string, to: RequestStatus) {
  const req = await tx.calibrationRequest.findUniqueOrThrow({ where: { id } });
  try {
    assertRequestTransition(req.status, to);
  } catch (err) {
    throw new UserError((err as Error).message);
  }
  await tx.calibrationRequest.update({
    where: { id },
    data: { status: to, ...(to === "SUBMITTED" ? { submittedAt: new Date() } : {}) },
  });
}

export async function updateRequestNotes(tx: TenantTx, id: string, notes: string | null) {
  const req = await tx.calibrationRequest.findUniqueOrThrow({ where: { id } });
  if (!isEditable(req.status)) throw new UserError("Only draft requests can be changed");
  await tx.calibrationRequest.update({ where: { id }, data: { notes } });
}

// ───────────────────────── M3: vendor assignment, approval, release ─────────────────────────

/**
 * Auto-assigns each active item: cheapest usable rate-contract vendor (then shortest TAT) → CONTRACT,
 * otherwise RFQ. Adds a scope warning when the chosen lab's scope doesn't cover the instrument.
 * `onlyUnassigned` keeps manual overrides.
 */
export async function assignVendors(tx: TenantTx, requestId: string, opts: { onlyUnassigned?: boolean } = {}) {
  const { organizationId } = currentTenant();
  const req = await tx.calibrationRequest.findUniqueOrThrow({ where: { id: requestId } });
  const items = await tx.calibrationRequestItem.findMany({
    where: { requestId, removedAt: null, ...(opts.onlyUnassigned ? { sourcing: null } : {}) },
    include: {
      instrument: {
        select: {
          typeId: true,
          nablRequired: true,
          rangeMin: true,
          rangeMax: true,
          unit: true,
          type: { select: { parameter: true } },
        },
      },
    },
  });
  if (!items.length) return { contract: 0, rfq: 0 };
  const rates = await contractRatesByType(tx, organizationId, [...new Set(items.map((i) => i.instrument.typeId))]);
  const scopes = (
    await tx.vendorScope.findMany({
      where: { archivedAt: null },
      select: { vendorId: true, parameter: true, rangeMin: true, rangeMax: true, unit: true },
    })
  ).map(toScopeRow);

  let contract = 0;
  let rfq = 0;
  for (const item of items) {
    const sel = selectVendor(rates.get(item.instrument.typeId) ?? [], {
      plantId: req.plantId,
      nablRequired: item.instrument.nablRequired,
    });
    const target = {
      parameter: item.instrument.type.parameter,
      rangeMin: item.instrument.rangeMin?.toNumber() ?? null,
      rangeMax: item.instrument.rangeMax?.toNumber() ?? null,
      unit: item.instrument.unit,
    };
    if (sel.sourcing === "CONTRACT") {
      contract++;
      const vendorScopes = scopes.filter((s) => s.vendorId === sel.choice.vendorId);
      const covered = vendorScopes.some((s) => scopeCovers(s, target));
      await tx.calibrationRequestItem.update({
        where: { id: item.id },
        data: {
          sourcing: "CONTRACT",
          proposedVendorId: sel.choice.vendorId,
          rateContractItemId: sel.choice.rateContractItemId,
          scopeWarning: covered
            ? null
            : vendorScopes.length
              ? `${sel.choice.vendorName}'s scope may not cover this range`
              : `${sel.choice.vendorName} has no scope rows on file`,
        },
      });
    } else {
      rfq++;
      const anyCovering = coveringVendorIds(scopes, target).size > 0;
      await tx.calibrationRequestItem.update({
        where: { id: item.id },
        data: {
          sourcing: "RFQ",
          proposedVendorId: null,
          rateContractItemId: null,
          scopeWarning: anyCovering ? sel.reason : `${sel.reason}. No lab on file covers this scope`,
        },
      });
    }
  }
  return { contract, rfq };
}

/** Manual override while the request is a draft or awaiting approval: pick a contract rate or send to RFQ. */
export async function setItemSourcing(tx: TenantTx, itemId: string, choice: { rateContractItemId: string } | "RFQ") {
  const item = await tx.calibrationRequestItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { request: true, instrument: { select: { typeId: true } } },
  });
  if (!["DRAFT", "SUBMITTED"].includes(item.request.status)) throw new UserError("Sourcing can be changed only before approval");
  if (choice === "RFQ") {
    await tx.calibrationRequestItem.update({
      where: { id: itemId },
      data: { sourcing: "RFQ", proposedVendorId: null, rateContractItemId: null, scopeWarning: null },
    });
    return;
  }
  const rate = await tx.rateContractItem.findUniqueOrThrow({
    where: { id: choice.rateContractItemId },
    include: { contract: true },
  });
  if (rate.instrumentTypeId !== item.instrument.typeId) throw new UserError("That rate is for a different instrument type");
  if (!contractInForce(rate.contract)) throw new UserError("That contract is not in force");
  await tx.calibrationRequestItem.update({
    where: { id: itemId },
    data: { sourcing: "CONTRACT", proposedVendorId: rate.contract.vendorId, rateContractItemId: rate.id, scopeWarning: null },
  });
}

/** DRAFT → SUBMITTED, or straight to APPROVED when the org doesn't require approval. */
export async function submitRequest(tx: TenantTx, id: string) {
  const { organizationId } = currentTenant();
  const req = await tx.calibrationRequest.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { items: { where: { removedAt: null } } } } },
  });
  if (!req._count.items) throw new UserError("Add instruments before submitting");
  await assignVendors(tx, id, { onlyUnassigned: true });
  await changeRequestStatus(tx, id, "SUBMITTED");
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  if (!parseOrgSettings(org.settings).requireRequestApproval) await changeRequestStatus(tx, id, "APPROVED");
}

export async function approveRequest(tx: TenantTx, id: string) {
  await changeRequestStatus(tx, id, "APPROVED");
}

export async function sendBackRequest(tx: TenantTx, id: string, reason: string) {
  const req = await tx.calibrationRequest.findUniqueOrThrow({ where: { id } });
  await changeRequestStatus(tx, id, "DRAFT");
  const note = `Sent back: ${reason}`.trim();
  await tx.calibrationRequest.update({ where: { id }, data: { notes: req.notes ? `${req.notes}\n${note}` : note } });
}

export type ReleaseResult = {
  purchaseOrders: { id: string; number: string; vendor: string; items: number }[];
  rfq: { id: string; number: string; items: number } | null;
};

/**
 * One click: contract items → one draft PO per vendor (rates/GST/TAT from the contract);
 * RFQ items → one RFQ inviting approved labs whose scope covers them. Request → PO_RAISED or SOURCING.
 */
export async function releaseRequest(tx: TenantTx, id: string, now = new Date()): Promise<ReleaseResult> {
  const { organizationId } = currentTenant();
  const req = await tx.calibrationRequest.findUniqueOrThrow({ where: { id } });
  if (req.status !== "APPROVED") throw new UserError("Only approved requests can be released");
  const items = await tx.calibrationRequestItem.findMany({
    where: { requestId: id, removedAt: null },
    include: {
      rateContractItem: { include: { contract: true } },
      instrument: {
        select: {
          id: true,
          code: true,
          description: true,
          rangeMin: true,
          rangeMax: true,
          unit: true,
          type: { select: { name: true, parameter: true } },
        },
      },
    },
  });
  if (!items.length) throw new UserError("The request has no instruments");

  const result: ReleaseResult = { purchaseOrders: [], rfq: null };
  const byVendor = new Map<string, typeof items>();
  const rfqItems: typeof items = [];
  for (const item of items) {
    const usable = item.sourcing === "CONTRACT" && item.rateContractItem && contractInForce(item.rateContractItem.contract, now);
    if (usable)
      byVendor.set(item.rateContractItem!.contract.vendorId, [
        ...(byVendor.get(item.rateContractItem!.contract.vendorId) ?? []),
        item,
      ]);
    else rfqItems.push(item);
  }

  for (const [vendorId, vendorItems] of byVendor) {
    const po = await createPurchaseOrder(tx, {
      plantId: req.plantId,
      vendorId,
      requestId: id,
      rfqId: null,
      source: "RATE_CONTRACT",
      lines: vendorItems.map((i) => ({
        instrumentId: i.instrument.id,
        requestItemId: i.id,
        description: describeInstrument(i.instrument),
        rate: i.rateContractItem!.rate.toNumber(),
        gstPercent: i.rateContractItem!.gstPercent.toNumber(),
        tatDays: i.rateContractItem!.tatDays,
      })),
    });
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { name: true } });
    result.purchaseOrders.push({ id: po.id, number: po.number, vendor: vendor.name, items: vendorItems.length });
  }

  if (rfqItems.length) {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
    const number = await nextDocNumber(tx, { plantId: req.plantId, docType: "RFQ" });
    const dueAt = new Date(
      startOfIstDay(now).getTime() + (parseOrgSettings(org.settings).rfqResponseDays + 1) * 86_400_000 - 60_000,
    );
    const rfq = await tx.rfq.create({ data: { organizationId, plantId: req.plantId, requestId: id, number, dueAt } });
    if (rfqItems.some((i) => i.sourcing !== "RFQ")) {
      await tx.calibrationRequestItem.updateMany({
        where: { id: { in: rfqItems.map((i) => i.id) } },
        data: { sourcing: "RFQ", proposedVendorId: null, rateContractItemId: null },
      });
    }
    // Invite approved, linked labs whose scope covers at least one RFQ item
    const scopes = (
      await tx.vendorScope.findMany({
        where: { archivedAt: null },
        select: { vendorId: true, parameter: true, rangeMin: true, rangeMax: true, unit: true },
      })
    ).map(toScopeRow);
    const covering = new Set<string>();
    for (const i of rfqItems) {
      for (const v of coveringVendorIds(scopes, {
        parameter: i.instrument.type.parameter,
        rangeMin: i.instrument.rangeMin?.toNumber() ?? null,
        rangeMax: i.instrument.rangeMax?.toNumber() ?? null,
        unit: i.instrument.unit,
      }))
        covering.add(v);
    }
    const approved = await tx.vendorLink.findMany({
      where: { vendorId: { in: [...covering] }, isApproved: true, archivedAt: null },
      select: { vendorId: true },
    });
    if (approved.length) {
      await tx.rfqVendor.createMany({ data: approved.map((a) => ({ organizationId, rfqId: rfq.id, vendorId: a.vendorId })) });
      await notifyRfqInvites(
        tx,
        rfq.id,
        approved.map((a) => a.vendorId),
        process.env.APP_URL ?? "http://localhost:3000",
      );
    }
    result.rfq = { id: rfq.id, number, items: rfqItems.length };
  }

  await changeRequestStatus(tx, id, "SOURCING");
  if (!rfqItems.length) await changeRequestStatus(tx, id, "PO_RAISED");
  return result;
}

export function describeInstrument(i: {
  code: string;
  description: string | null;
  rangeMin: { toNumber(): number } | null;
  rangeMax: { toNumber(): number } | null;
  unit: string | null;
  type: { name: string };
}) {
  const base = i.description || i.type.name;
  const max = i.rangeMax?.toNumber();
  // Skip the range when the name already states it (e.g. "Torque Wrench 20–100 Nm")
  const range =
    i.rangeMin != null && max != null && !base.includes(String(max))
      ? ` (${i.rangeMin.toNumber()}–${max}${i.unit ? ` ${i.unit}` : ""})`
      : "";
  return `Calibration of ${base}${range}`;
}
