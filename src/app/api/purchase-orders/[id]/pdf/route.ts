import { getAppContext } from "@/server/context";
import { renderPurchaseOrderPdfById } from "@/server/pdf/purchase-order";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!ctx.can("po.manage") && !ctx.can("po.approve") && !ctx.can("calibration.request"))
    return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  try {
    const { buffer, fileName } = await renderPurchaseOrderPdfById(ctx.org.id, id, ctx.tenant.plantIds);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
