import { headers } from "next/headers";

export function ipFromHeaders(h: Headers): string | null {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

/** Client IP of the current request (server components / actions). */
export async function clientIp(): Promise<string | null> {
  try {
    return ipFromHeaders(await headers());
  } catch {
    return null; // outside a request (worker, tests)
  }
}
