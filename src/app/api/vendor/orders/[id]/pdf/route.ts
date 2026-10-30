import { renderPurchaseOrderPdfById } from "@/server/pdf/purchase-order";
import { getVendorContext } from "@/server/vendor-portal/context";
import { portalOrder } from "@/server/vendor-portal/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getVendorContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const po = await portalOrder(ctx, id);
  if (!po) return new Response("Not found", { status: 404 });
  const { buffer, fileName } = await renderPurchaseOrderPdfById(po.organizationId, po.id);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
