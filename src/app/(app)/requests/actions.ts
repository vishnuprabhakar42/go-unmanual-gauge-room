"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/action";
import {
  approveRequest,
  assignVendors,
  changeRequestStatus,
  createRequestsFromSelection,
  releaseRequest,
  removeRequestItem,
  sendBackRequest,
  setItemSourcing,
  submitRequest,
  updateRequestNotes,
} from "@/server/services/calibration-requests";

const refresh = (id?: string) => {
  revalidatePath("/due");
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/requests/${id}`);
};

export const createRequestsAction = defineAction(
  {
    permission: "calibration.request",
    input: z.object({
      instrumentIds: z.array(z.string().min(1)).min(1, "Select instruments").max(2000),
      notes: z.string().trim().max(2000).optional(),
    }),
  },
  async ({ instrumentIds, notes }, { tx }) => {
    const res = await createRequestsFromSelection(tx, instrumentIds, notes || null);
    refresh();
    return res;
  },
);

export const removeRequestItemAction = defineAction(
  { permission: "calibration.request", input: z.object({ itemId: z.string().min(1), requestId: z.string().min(1) }) },
  async ({ itemId, requestId }, { tx }) => {
    await removeRequestItem(tx, itemId);
    refresh(requestId);
    return null;
  },
);

export const cancelRequestAction = defineAction(
  { permission: "calibration.request", input: z.object({ id: z.string().min(1) }) },
  async ({ id }, { tx }) => {
    await changeRequestStatus(tx, id, "CANCELLED");
    refresh(id);
    return null;
  },
);

export const updateRequestNotesAction = defineAction(
  { permission: "calibration.request", input: z.object({ id: z.string().min(1), notes: z.string().trim().max(2000) }) },
  async ({ id, notes }, { tx }) => {
    await updateRequestNotes(tx, id, notes || null);
    refresh(id);
    return null;
  },
);

// ── M3: sourcing, approval, release ──
export const setItemSourcingAction = defineAction(
  {
    permission: "calibration.request",
    input: z.object({
      requestId: z.string().min(1),
      itemId: z.string().min(1),
      choice: z.union([z.literal("RFQ"), z.object({ rateContractItemId: z.string().min(1) })]),
    }),
  },
  async ({ requestId, itemId, choice }, { tx }) => {
    await setItemSourcing(tx, itemId, choice);
    refresh(requestId);
    return null;
  },
);

export const reassignAction = defineAction(
  { permission: "calibration.request", input: z.object({ id: z.string().min(1) }) },
  async ({ id }, { tx }) => {
    const res = await assignVendors(tx, id);
    refresh(id);
    return res;
  },
);

export const submitRequestAction = defineAction(
  { permission: "calibration.request", input: z.object({ id: z.string().min(1) }) },
  async ({ id }, { tx }) => {
    await submitRequest(tx, id);
    refresh(id);
    return null;
  },
);

export const approveRequestAction = defineAction(
  { permission: "calibration.approve", input: z.object({ id: z.string().min(1) }) },
  async ({ id }, { tx }) => {
    await approveRequest(tx, id);
    refresh(id);
    return null;
  },
);

export const sendBackRequestAction = defineAction(
  {
    permission: "calibration.approve",
    input: z.object({ id: z.string().min(1), reason: z.string().trim().min(3, "Say what needs to change").max(500) }),
  },
  async ({ id, reason }, { tx }) => {
    await sendBackRequest(tx, id, reason);
    refresh(id);
    return null;
  },
);

export const releaseRequestAction = defineAction(
  { permission: "po.manage", input: z.object({ id: z.string().min(1) }) },
  async ({ id }, { tx }) => {
    const res = await releaseRequest(tx, id);
    refresh(id);
    revalidatePath("/purchase/orders");
    revalidatePath("/purchase/rfqs");
    return res;
  },
);
