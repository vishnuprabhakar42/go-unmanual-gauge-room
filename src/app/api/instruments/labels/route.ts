import { getAppContext } from "@/server/context";
import { renderLabelsPdf, type LabelLayout, type LabelSize } from "@/server/pdf/labels";
import { tenantDb } from "@/server/tenant";

export const dynamic = "force-dynamic";
const MAX_LABELS = 1000;

/** POST form (ids, size, layout) → PDF of QR labels. */
export async function POST(req: Request) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!ctx.can("instrument.view")) return new Response("Forbidden", { status: 403 });

  const form = await req.formData();
  const ids = String(form.get("ids") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, MAX_LABELS);
  const size: LabelSize = form.get("size") === "38x25" ? "38x25" : "50x25";
  const layout: LabelLayout = form.get("layout") === "a4" ? "a4" : "roll";
  if (ids.length === 0) return new Response("No instruments selected", { status: 400 });

  const rows = await tenantDb(ctx.tenant).instrument.findMany({
    where: { id: { in: ids } },
    orderBy: { code: "asc" },
    select: {
      code: true,
      description: true,
      qrToken: true,
      lastCalibratedAt: true,
      nextDueAt: true,
      type: { select: { name: true } },
    },
  });
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const pdf = await renderLabelsPdf(
    rows.map((r) => ({
      code: r.code,
      title: r.description || r.type.name,
      lastCalibratedAt: r.lastCalibratedAt,
      nextDueAt: r.nextDueAt,
      url: `${base}/i/${r.qrToken}`,
    })),
    size,
    layout,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="labels-${size}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
