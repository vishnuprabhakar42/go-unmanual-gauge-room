"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateInput } from "@/domain/instrument-schemas";
import { LAB_PROGRESS } from "@/domain/lab-progress";
import { defineAction, toActionError, type ActionResult } from "@/server/action";
import { getAppContext } from "@/server/context";
import { attachCertificate } from "@/server/services/certificates";
import { updateLabProgress } from "@/server/services/lab-jobs";
import { withTenantTx } from "@/server/tenant";
import {
  cancelChallan,
  createChallan,
  dispatchChallan,
  issueChallan,
  receiveByScan,
  receiveItems,
} from "@/server/services/challans";

const id = z.string().min(1);
const refresh = (challanId?: string) => {
  for (const p of ["/dispatch", "/dispatch/challans", "/dispatch/receive", "/dispatch/overdue", "/dashboard", "/instruments"])
    revalidatePath(p);
  if (challanId) revalidatePath(`/dispatch/challans/${challanId}`);
};

export const createChallanAction = defineAction(
  {
    permission: "dispatch.manage",
    input: z.object({
      poId: id,
      notes: z.string().trim().max(1000).optional(),
      lines: z
        .array(
          z.object({
            poItemId: id,
            value: z.coerce.number<string | number>().positive("Enter the value"),
            hsnCode: z
              .string()
              .trim()
              .regex(/^(\d{4}|\d{6}|\d{8})?$/, "HSN is 4, 6 or 8 digits"),
            description: z.string().trim().min(1).max(300),
          }),
        )
        .min(1, "Select at least one instrument"),
    }),
  },
  async ({ poId, notes, lines }, { tx }) => {
    const c = await createChallan(tx, {
      poId,
      notes: notes || null,
      lines: lines.map((l) => ({ ...l, hsnCode: l.hsnCode || null })),
    });
    refresh();
    return { id: c.id };
  },
);

export const issueChallanAction = defineAction(
  { permission: "dispatch.manage", input: z.object({ id }) },
  async ({ id }, { tx }) => {
    const number = await issueChallan(tx, id);
    refresh(id);
    return { number };
  },
);

export const dispatchChallanAction = defineAction(
  {
    permission: "dispatch.manage",
    input: z.object({
      id,
      transportMode: z.enum(["BY_HAND", "COURIER", "VEHICLE", "VENDOR_PICKUP"]),
      vehicleNo: z.string().trim().max(15).optional(),
      courierName: z.string().trim().max(60).optional(),
      awbNo: z.string().trim().max(40).optional(),
      ewayBillNo: z.string().trim().max(12).optional(),
      expectedReturnAt: dateInput,
    }),
  },
  async ({ id, expectedReturnAt, ...input }, { tx }) => {
    const res = await dispatchChallan(tx, id, { ...input, expectedReturnAt: expectedReturnAt ?? null });
    refresh(id);
    return res;
  },
);

export const receiveItemsAction = defineAction(
  {
    permission: "receipt.manage",
    input: z.object({
      challanId: id,
      itemIds: z.array(id).min(1, "Select instruments"),
      remarks: z.string().trim().max(300).optional(),
    }),
  },
  async ({ challanId, itemIds, remarks }, { tx }) => {
    const res = await receiveItems(tx, challanId, itemIds, remarks || null);
    refresh(challanId);
    return res;
  },
);

export const receiveByScanAction = defineAction(
  {
    permission: "receipt.manage",
    input: z.object({
      scanned: z.string().trim().min(1, "Scan a label").max(300),
      remarks: z.string().trim().max(300).optional(),
    }),
  },
  async ({ scanned, remarks }, { tx }) => {
    const res = await receiveByScan(tx, scanned, remarks || null);
    revalidatePath(`/dispatch/challans/${res.challanId}`);
    return res;
  },
);

export const cancelChallanAction = defineAction(
  { permission: "dispatch.manage", input: z.object({ id }) },
  async ({ id }, { tx }) => {
    await cancelChallan(tx, id);
    refresh(id);
    return null;
  },
);

// ── On the lab's behalf (labs that never log in) ──
export const internalLabProgressAction = defineAction(
  {
    permission: "receipt.manage",
    input: z.object({
      jobId: id,
      to: z.enum(LAB_PROGRESS),
      returnCourier: z.string().trim().max(60).optional(),
      returnAwb: z.string().trim().max(60).optional(),
      returnNote: z.string().trim().max(300).optional(),
    }),
  },
  async ({ jobId, ...u }, { tx }) => {
    await updateLabProgress(tx, jobId, u);
    revalidatePath("/dispatch/lab-jobs");
    return null;
  },
);

/** FormData: jobId, file. */
export async function internalUploadCertificateAction(form: FormData): Promise<ActionResult<{ code: string }>> {
  try {
    const app = await getAppContext();
    if (!app) return { ok: false, error: "Your session has expired. Please sign in again." };
    if (!app.can("receipt.manage") && !app.can("certificate.verify"))
      return { ok: false, error: "You don't have permission to do that." };
    const jobId = String(form.get("jobId") ?? "");
    const file = form.get("file");
    if (!jobId || !(file instanceof File)) return { ok: false, error: "Choose a file and an instrument" };
    const bytes = Buffer.from(await file.arrayBuffer());
    const res = await withTenantTx(app.tenant, (tx) => attachCertificate(tx, jobId, { name: file.name, bytes }));
    revalidatePath("/dispatch/lab-jobs");
    return { ok: true, data: { code: res.code } };
  } catch (err) {
    return toActionError(err);
  }
}
