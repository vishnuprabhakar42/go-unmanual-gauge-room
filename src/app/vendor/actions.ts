"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateInput } from "@/domain/instrument-schemas";
import { LAB_PROGRESS } from "@/domain/lab-progress";
import type { ActionResult } from "@/server/action";
import { toActionError } from "@/server/action";
import { defineVendorAction } from "@/server/vendor-portal/action";
import { getVendorContext } from "@/server/vendor-portal/context";
import { portalAcknowledgePo, portalSubmitQuote, portalUpdateJob, portalUploadCertificate } from "@/server/vendor-portal/data";

const id = z.string().min(1);

export const submitQuoteAction = defineVendorAction(
  z.object({
    rfqId: id,
    validUntil: dateInput,
    remarks: z.string().trim().max(1000).optional(),
    lines: z
      .array(
        z.object({
          requestItemId: id,
          rate: z.coerce.number<string | number>().positive("Rate > 0").max(10_000_000),
          gstPercent: z.coerce.number<string | number>().min(0).max(28),
          tatDays: z.coerce.number<string | number>().int().min(1).max(180),
          nablInScope: z.boolean(),
          technicalRemarks: z.string().trim().max(300).optional(),
        }),
      )
      .min(1, "Enter a rate for at least one instrument"),
  }),
  async ({ rfqId, validUntil, remarks, lines }, ctx) => {
    await portalSubmitQuote(ctx, rfqId, { lines, validUntil: validUntil ?? null, remarks: remarks || null });
    revalidatePath(`/vendor/rfqs/${rfqId}`);
    revalidatePath("/vendor");
    return null;
  },
);

export const acknowledgePoAction = defineVendorAction(z.object({ poId: id }), async ({ poId }, ctx) => {
  await portalAcknowledgePo(ctx, poId);
  revalidatePath(`/vendor/orders/${poId}`);
  revalidatePath("/vendor");
  return null;
});

export const vendorLabProgressAction = defineVendorAction(
  z.object({
    jobId: id,
    to: z.enum(LAB_PROGRESS),
    returnCourier: z.string().trim().max(60).optional(),
    returnAwb: z.string().trim().max(60).optional(),
    returnNote: z.string().trim().max(300).optional(),
  }),
  async ({ jobId, ...u }, ctx) => {
    await portalUpdateJob(ctx, jobId, u);
    revalidatePath("/vendor/jobs");
    return null;
  },
);

/** FormData: jobId, file (one PDF per call so large batches don't hit body limits). */
export async function vendorUploadCertificateAction(form: FormData): Promise<ActionResult<{ code: string }>> {
  try {
    const ctx = await getVendorContext();
    if (!ctx) return { ok: false, error: "Your session has expired. Please sign in again." };
    const jobId = String(form.get("jobId") ?? "");
    const file = form.get("file");
    if (!jobId || !(file instanceof File)) return { ok: false, error: "Choose a file and an instrument" };
    const res = await portalUploadCertificate(ctx, jobId, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    revalidatePath("/vendor/certificates");
    revalidatePath("/vendor/jobs");
    return { ok: true, data: { code: res.code } };
  } catch (err) {
    return toActionError(err);
  }
}
