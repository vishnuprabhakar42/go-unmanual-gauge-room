import type { NextRequest } from "next/server";
import { LocalStorage, storage } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Serves local-driver files for valid, unexpired signed URLs only (S3 serves its own presigned URLs). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const s = storage();
  if (!(s instanceof LocalStorage)) return new Response("Not found", { status: 404 });
  const key = (await params).key.map(decodeURIComponent).join("/");
  const sp = req.nextUrl.searchParams;
  const exp = Number(sp.get("exp"));
  const name = sp.get("name") ?? "file";
  const type = sp.get("type") ?? "application/octet-stream";
  if (!s.verify(key, exp, name, type, sp.get("sig") ?? "")) return new Response("Link expired or invalid", { status: 403 });
  try {
    const body = await s.get(key);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
