"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateInput } from "@/domain/instrument-schemas";
import { rateContractSchema, rateItemSchema } from "@/domain/vendor-schemas";
import { defineAction } from "@/server/action";
import {
  acknowledgePurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  sendPurchaseOrder,
} from "@/server/services/purchase-orders";
import {
  activateRateContract,
  createRateContract,
  expireRateContract,
  saveRateItems,
  updateRateContract,
} from "@/server/services/rate-contracts";
import { awardRfq, inviteVendors, reviewQuote, saveQuote, setRfqStatus } from "@/server/services/rfqs";

const id = z.string().min(1);
const refresh = (...paths: string[]) => {
  for (const p of ["/purchase/orders", "/purchase/rfqs", "/purchase/contracts", "/requests", "/dashboard", ...paths])
    revalidatePath(p);
};

// ── Rate contracts ──
export const createContractAction = defineAction(
  { permission: "rateContract.manage", input: rateContractSchema },
  async (input, { tx }) => {
    const c = await createRateContract(tx, input);
    refresh();
    return { id: c.id };
  },
);

export const updateContractAction = defineAction(
  { permission: "rateContract.manage", input: z.object({ id, data: rateContractSchema }) },
  async ({ id, data }, { tx }) => {
    await updateRateContract(tx, id, data);
    refresh(`/purchase/contracts/${id}`);
    return null;
  },
);

export const saveRatesAction = defineAction(
  { permission: "rateContract.manage", input: z.object({ id, items: z.array(rateItemSchema).max(500) }) },
  async ({ id, items }, { tx }) => {
    await saveRateItems(tx, id, items);
    refresh(`/purchase/contracts/${id}`);
    return null;
  },
);

export const contractStatusAction = defineAction(
  { permission: "rateContract.manage", input: z.object({ id, to: z.enum(["ACTIVE", "EXPIRED"]) }) },
  async ({ id, to }, { tx }) => {
    if (to === "ACTIVE") await activateRateContract(tx, id);
    else await expireRateContract(tx, id);
    refresh(`/purchase/contracts/${id}`);
    return null;
  },
);

// ── RFQs ──
export const inviteVendorsAction = defineAction(
  { permission: "rfq.manage", input: z.object({ rfqId: id, vendorIds: z.array(id).min(1) }) },
  async ({ rfqId, vendorIds }, { tx }) => {
    const n = await inviteVendors(tx, rfqId, vendorIds);
    refresh(`/purchase/rfqs/${rfqId}`);
    return n;
  },
);

const money = z.coerce.number<string | number>().positive().max(10_000_000);
export const saveQuoteAction = defineAction(
  {
    permission: "rfq.manage",
    input: z.object({
      rfqId: id,
      vendorId: id,
      validUntil: dateInput,
      remarks: z.string().trim().max(1000).optional(),
      lines: z
        .array(
          z.object({
            requestItemId: id,
            rate: money,
            gstPercent: z.coerce.number<string | number>().min(0).max(28),
            tatDays: z.coerce.number<string | number>().int().min(1).max(180),
            nablInScope: z.boolean(),
            technicalRemarks: z.string().trim().max(300).optional(),
          }),
        )
        .min(1, "Enter at least one rate"),
    }),
  },
  async ({ rfqId, vendorId, validUntil, remarks, lines }, { tx }) => {
    await saveQuote(tx, rfqId, vendorId, { lines, validUntil: validUntil ?? null, remarks: remarks || null });
    refresh(`/purchase/rfqs/${rfqId}`);
    return null;
  },
);

export const reviewQuoteAction = defineAction(
  {
    permission: "quote.techApprove",
    input: z.object({ rfqId: id, quoteId: id, approved: z.boolean(), remarks: z.string().trim().max(500).optional() }),
  },
  async ({ rfqId, quoteId, approved, remarks }, { tx }) => {
    await reviewQuote(tx, quoteId, approved, remarks || null);
    refresh(`/purchase/rfqs/${rfqId}`);
    return null;
  },
);

export const awardRfqAction = defineAction(
  { permission: "rfq.manage", input: z.object({ rfqId: id, awards: z.record(z.string(), id) }) },
  async ({ rfqId, awards }, { tx }) => {
    const pos = await awardRfq(tx, rfqId, awards);
    refresh(`/purchase/rfqs/${rfqId}`);
    return pos;
  },
);

export const rfqStatusAction = defineAction(
  { permission: "rfq.manage", input: z.object({ rfqId: id, to: z.enum(["OPEN", "CLOSED", "CANCELLED"]) }) },
  async ({ rfqId, to }, { tx }) => {
    await setRfqStatus(tx, rfqId, to);
    refresh(`/purchase/rfqs/${rfqId}`);
    return null;
  },
);

// ── Purchase orders ──
export const approvePoAction = defineAction({ permission: "po.approve", input: z.object({ id }) }, async ({ id }, { tx }) => {
  await approvePurchaseOrder(tx, id);
  refresh(`/purchase/orders/${id}`);
  return null;
});

export const sendPoAction = defineAction({ permission: "po.manage", input: z.object({ id }) }, async ({ id }, { tx }) => {
  const res = await sendPurchaseOrder(tx, id, process.env.APP_URL ?? "http://localhost:3000");
  refresh(`/purchase/orders/${id}`);
  return res;
});

export const poStatusAction = defineAction(
  { permission: "po.manage", input: z.object({ id, to: z.enum(["CANCELLED", "ACKNOWLEDGED"]) }) },
  async ({ id, to }, { tx }) => {
    if (to === "CANCELLED") await cancelPurchaseOrder(tx, id);
    else await acknowledgePurchaseOrder(tx, id);
    refresh(`/purchase/orders/${id}`);
    return null;
  },
);
