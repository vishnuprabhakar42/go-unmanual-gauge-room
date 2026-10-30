import type { EmailMessage } from "./types";

/**
 * Builds email attachments at delivery time (worker), keyed by template. Keeps large binaries
 * out of the Notification row and the job payload.
 */
type Builder = (payload: Record<string, unknown>, organizationId: string) => Promise<EmailMessage["attachments"]>;

const BUILDERS: Record<string, Builder> = {
  "po.sent": async (payload, organizationId) => {
    const { renderPurchaseOrderPdfById } = await import("@/server/pdf/purchase-order");
    const { buffer, fileName } = await renderPurchaseOrderPdfById(organizationId, String(payload.poId));
    return [{ filename: fileName, content: buffer, contentType: "application/pdf" }];
  },
};

export async function buildAttachments(
  template: string,
  payload: unknown,
  organizationId: string,
): Promise<EmailMessage["attachments"]> {
  const builder = BUILDERS[template];
  return builder ? builder(payload as Record<string, unknown>, organizationId) : undefined;
}
