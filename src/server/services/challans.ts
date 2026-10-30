import {
  CHALLAN_REASON,
  EWAY_BILL_REGEX,
  VEHICLE_NO_REGEX,
  canCancelChallan,
  challanStatusFromReturns,
  expectedReturn,
  normalizeVehicleNo,
} from "@/domain/challan";
import { sequential } from "@/server/sequential";
import { startOfIstDay } from "@/domain/due";
import { UserError } from "@/server/errors";
import { nextDocNumber } from "@/server/number-series";
import { currentTenant, type TenantClient, type TenantTx } from "@/server/tenant";
import { ensureJobsForPo, moveJob } from "./calibration-jobs";
import { changeInstrumentStatus, recordEvent } from "./instruments";

const DISPATCHABLE_PO = ["APPROVED", "SENT", "ACKNOWLEDGED"] as const;
const OPEN_CHALLAN = ["DRAFT", "ISSUED", "PARTIALLY_RETURNED"] as const;

/** PO items whose instruments can go on a new challan (in store / in use, not on another open challan). */
export async function challanCandidates(db: Pick<TenantClient, "purchaseOrder">, poId: string) {
  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          instrument: {
            select: {
              id: true,
              code: true,
              status: true,
              purchaseValue: true,
              description: true,
              serialNo: true,
              type: { select: { name: true, hsnCode: true } },
              challanItems: {
                where: { returnedAt: null, challan: { status: { in: [...OPEN_CHALLAN] } } },
                select: { challan: { select: { number: true, id: true } } },
              },
            },
          },
        },
      },
    },
  });
  return {
    po,
    items: po.items.map((i) => {
      const onChallan = i.instrument.challanItems[0]?.challan;
      const blocked = onChallan
        ? `On challan ${onChallan.number ?? "(draft)"}`
        : !["IN_STORE", "IN_USE"].includes(i.instrument.status)
          ? `Status ${i.instrument.status}`
          : null;
      return {
        poItemId: i.id,
        instrumentId: i.instrument.id,
        code: i.instrument.code,
        description: `${i.instrument.type.name}${i.instrument.description ? ` — ${i.instrument.description}` : ""}${i.instrument.serialNo ? ` (S/N ${i.instrument.serialNo})` : ""}`,
        hsnCode: i.instrument.type.hsnCode ?? "",
        value: i.instrument.purchaseValue?.toNumber() ?? null,
        tatDays: i.tatDays,
        blocked,
      };
    }),
  };
}

export type ChallanLineInput = { poItemId: string; value: number; hsnCode: string | null; description: string };

export async function createChallan(tx: TenantTx, input: { poId: string; lines: ChallanLineInput[]; notes?: string | null }) {
  const { organizationId, actorId } = currentTenant();
  if (!input.lines.length) throw new UserError("Select at least one instrument");
  const { po, items } = await challanCandidates(tx, input.poId);
  if (!(DISPATCHABLE_PO as readonly string[]).includes(po.status))
    throw new UserError("Only approved purchase orders can be dispatched");
  const byPoItem = new Map(items.map((i) => [i.poItemId, i]));
  for (const l of input.lines) {
    const c = byPoItem.get(l.poItemId);
    if (!c) throw new UserError("An item doesn't belong to this PO");
    if (c.blocked) throw new UserError(`${c.code}: ${c.blocked}`);
    if (!(l.value > 0)) throw new UserError(`${c.code}: enter the instrument's value (required on a delivery challan)`);
  }
  const [plant, vendor, org] = await sequential([
    tx.plant.findUniqueOrThrow({ where: { id: po.plantId } }),
    tx.vendor.findUniqueOrThrow({ where: { id: po.vendorId } }),
    tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { gstin: true } }),
  ]);
  const challan = await tx.deliveryChallan.create({
    data: {
      organizationId,
      plantId: po.plantId,
      vendorId: po.vendorId,
      poId: po.id,
      reason: CHALLAN_REASON,
      consignorGstin: plant.gstin ?? org.gstin,
      consigneeGstin: vendor.gstin,
      placeOfSupply: vendor.stateCode,
      notes: input.notes ?? null,
      createdById: actorId,
    },
  });
  await tx.deliveryChallanItem.createMany({
    data: input.lines.map((l) => ({
      organizationId,
      challanId: challan.id,
      instrumentId: byPoItem.get(l.poItemId)!.instrumentId,
      poItemId: l.poItemId,
      hsnCode: l.hsnCode || null,
      description: l.description,
      value: l.value,
    })),
  });
  return challan;
}

/** DRAFT → ISSUED: assigns the DC number (≤16 chars) and date; instruments → AWAITING_DISPATCH. */
export async function issueChallan(tx: TenantTx, id: string) {
  const challan = await tx.deliveryChallan.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { instrument: { select: { id: true, code: true, status: true } } } } },
  });
  if (challan.status !== "DRAFT") throw new UserError("Only draft challans can be issued");
  for (const item of challan.items) {
    if (!["IN_STORE", "IN_USE"].includes(item.instrument.status))
      throw new UserError(`${item.instrument.code} is ${item.instrument.status} — remove it or return it to store first`);
  }
  const number = await nextDocNumber(tx, { plantId: challan.plantId, docType: "DC" });
  await tx.deliveryChallan.update({ where: { id }, data: { status: "ISSUED", number, date: new Date() } });
  for (const item of challan.items) await changeInstrumentStatus(tx, item.instrument.id, "AWAITING_DISPATCH");
  return number;
}

export type DispatchInput = {
  transportMode: "BY_HAND" | "COURIER" | "VEHICLE" | "VENDOR_PICKUP";
  vehicleNo?: string | null;
  courierName?: string | null;
  awbNo?: string | null;
  ewayBillNo?: string | null;
  expectedReturnAt?: Date | null;
};

/** Stores hands over the instruments: gate pass number, instruments → AT_VENDOR, jobs → DISPATCHED. */
export async function dispatchChallan(tx: TenantTx, id: string, input: DispatchInput, now = new Date()) {
  const { actorId } = currentTenant();
  const challan = await tx.deliveryChallan.findUniqueOrThrow({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      items: { include: { poItem: { select: { tatDays: true } }, instrument: { select: { id: true, status: true } } } },
    },
  });
  if (challan.status !== "ISSUED" || challan.dispatchedAt)
    throw new UserError("Only issued challans that haven't left can be dispatched");
  const vehicleNo = input.vehicleNo ? normalizeVehicleNo(input.vehicleNo) : null;
  if (input.transportMode === "VEHICLE" && (!vehicleNo || !VEHICLE_NO_REGEX.test(vehicleNo)))
    throw new UserError("Enter a valid vehicle number (e.g. MH12AB1234)", { vehicleNo: ["Invalid vehicle number"] });
  if (input.transportMode === "COURIER" && (!input.courierName?.trim() || !input.awbNo?.trim()))
    throw new UserError("Enter the courier name and AWB number", { awbNo: ["Required for courier"] });
  if (input.ewayBillNo && !EWAY_BILL_REGEX.test(input.ewayBillNo))
    throw new UserError("e-way bill numbers have 12 digits", { ewayBillNo: ["12 digits"] });

  const gatePassNo = await nextDocNumber(tx, { plantId: challan.plantId, docType: "GP" });
  const expected =
    input.expectedReturnAt ??
    expectedReturn(
      now,
      challan.items.map((i) => i.poItem?.tatDays ?? 7),
    );
  await tx.deliveryChallan.update({
    where: { id },
    data: {
      transportMode: input.transportMode,
      vehicleNo,
      courierName: input.courierName?.trim() || null,
      awbNo: input.awbNo?.trim() || null,
      ewayBillNo: input.ewayBillNo || null,
      expectedReturnAt: expected,
      gatePassNo,
      dispatchedAt: now,
      dispatchedById: actorId,
    },
  });

  await ensureJobsForPo(tx, challan.poId);
  for (const item of challan.items) {
    await changeInstrumentStatus(tx, item.instrument.id, "AT_VENDOR");
    const job = item.poItemId ? await tx.calibrationJob.findUnique({ where: { poItemId: item.poItemId } }) : null;
    if (job && job.status === "PO_RAISED") await moveJob(tx, job.id, "DISPATCHED", { challanItemId: item.id, sentAt: now });
    await recordEvent(tx, item.instrument.id, "SENT", {
      challan: challan.number,
      vendor: challan.vendor.name,
      gatePass: gatePassNo,
    });
  }
  return { gatePassNo, expectedReturnAt: expected };
}

/** Inward receipt (partial allowed): instruments → RECEIVED_PENDING_VERIFICATION, jobs → RETURNED. */
export async function receiveItems(
  tx: TenantTx,
  challanId: string,
  itemIds: string[],
  remarks: string | null = null,
  now = new Date(),
) {
  const { actorId } = currentTenant();
  const challan = await tx.deliveryChallan.findUniqueOrThrow({
    where: { id: challanId },
    include: { vendor: { select: { name: true } }, items: true },
  });
  if (!challan.dispatchedAt) throw new UserError("This challan hasn't been dispatched yet");
  const pending = new Map(challan.items.filter((i) => !i.returnedAt).map((i) => [i.id, i]));
  const toReceive = itemIds.map((id) => pending.get(id)).filter((i): i is NonNullable<typeof i> => !!i);
  if (!toReceive.length) throw new UserError("Nothing to receive — these instruments are already back");

  for (const item of toReceive) {
    await tx.deliveryChallanItem.update({
      where: { id: item.id },
      data: { returnedAt: now, receivedById: actorId, receiptRemarks: remarks },
    });
    await changeInstrumentStatus(tx, item.instrumentId, "RECEIVED_PENDING_VERIFICATION");
    const job = await tx.calibrationJob.findUnique({ where: { challanItemId: item.id } });
    if (job && (job.status === "DISPATCHED" || job.status === "AT_LAB")) {
      await moveJob(tx, job.id, "RETURNED", { receivedAt: now });
      // The lab uploaded the certificate before the instrument came back
      if (job.certificateFileId) await moveJob(tx, job.id, "CERT_UPLOADED");
    }
    await recordEvent(tx, item.instrumentId, "RECEIVED", { challan: challan.number, vendor: challan.vendor.name, remarks });
  }
  const after = challan.items.map((i) =>
    toReceive.some((r) => r.id === i.id) ? { returnedAt: now } : { returnedAt: i.returnedAt },
  );
  const status = challanStatusFromReturns(after);
  await tx.deliveryChallan.update({ where: { id: challanId }, data: { status } });
  return { received: toReceive.length, status };
}

/**
 * Receipt by scan: accepts an instrument code, a QR token, or a full /i/{token} URL (keyboard-wedge
 * barcode scanners type the URL). Finds the open challan item and receives it.
 */
export async function receiveByScan(tx: TenantTx, scanned: string, remarks: string | null = null) {
  const raw = scanned.trim();
  const token = raw.match(/\/i\/([0-9A-Za-z]{8,32})\/?$/)?.[1];
  const instrument = await tx.instrument.findFirst({
    where: token ? { qrToken: token } : { OR: [{ code: { equals: raw, mode: "insensitive" } }, { qrToken: raw }] },
    select: { id: true, code: true, status: true },
  });
  if (!instrument) throw new UserError(`No instrument matches “${raw}”`);
  const item = await tx.deliveryChallanItem.findFirst({
    where: {
      instrumentId: instrument.id,
      returnedAt: null,
      challan: { dispatchedAt: { not: null }, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] } },
    },
    select: { id: true, challanId: true, challan: { select: { number: true } } },
  });
  if (!item) throw new UserError(`${instrument.code} isn't out on any challan (status ${instrument.status})`);
  const res = await receiveItems(tx, item.challanId, [item.id], remarks);
  return { ...res, code: instrument.code, challanId: item.challanId, challanNumber: item.challan.number };
}

export async function cancelChallan(tx: TenantTx, id: string) {
  const challan = await tx.deliveryChallan.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { instrument: { select: { id: true, status: true } } } } },
  });
  if (!canCancelChallan(challan))
    throw new UserError("A dispatched challan can't be cancelled — receive the instruments instead");
  if (challan.status === "ISSUED") {
    for (const item of challan.items)
      if (item.instrument.status === "AWAITING_DISPATCH") await changeInstrumentStatus(tx, item.instrument.id, "IN_STORE");
  }
  await tx.deliveryChallan.update({ where: { id }, data: { status: "CANCELLED" } });
}

/** Instruments out on dispatched challans whose expected return date has passed. */
export async function overdueReturns(
  db: Pick<TenantClient, "deliveryChallanItem">,
  opts: { plantId?: string | null } = {},
  now = new Date(),
) {
  return db.deliveryChallanItem.findMany({
    where: {
      returnedAt: null,
      challan: {
        dispatchedAt: { not: null },
        status: { in: ["ISSUED", "PARTIALLY_RETURNED"] },
        expectedReturnAt: { lt: startOfIstDay(now) },
        ...(opts.plantId ? { plantId: opts.plantId } : {}),
      },
    },
    include: {
      instrument: {
        select: { id: true, code: true, plantId: true, type: { select: { name: true } }, plant: { select: { code: true } } },
      },
      challan: {
        select: { id: true, number: true, dispatchedAt: true, expectedReturnAt: true, vendor: { select: { name: true } } },
      },
    },
    orderBy: { challan: { expectedReturnAt: "asc" } },
  });
}
