import { NextResponse } from "next/server";
import { getAppContext } from "@/server/context";
import { attachmentUrl } from "@/server/services/certificates";
import { storage } from "@/server/storage";
import { tenantDb } from "@/server/tenant";
import { getVendorContext } from "@/server/vendor-portal/context";
import { portalAttachmentUrl } from "@/server/vendor-portal/data";

export const dynamic = "force-dynamic";

/** Permission check, then a redirect to a short-lived signed URL (never a public link). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getAppContext();
  const url = app
    ? await attachmentUrl(tenantDb(app.tenant), id)
    : await (async () => {
        const v = await getVendorContext();
        return v ? portalAttachmentUrl(v, id) : null;
      })();
  if (!url) return new Response("Not found", { status: 404 });
  // Local files are served by this app: stay on the origin the user is on (APP_URL may differ in dev).
  const local = storage().driver === "local" ? new URL(url) : null;
  const target = local ? new URL(local.pathname + local.search, req.url) : url;
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store" } });
}
