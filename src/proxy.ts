import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Optimistic auth gate (redirects anonymous users to /login).
 * Real authorization happens in every server action / page via src/server/context.ts.
 */
const PUBLIC_PREFIXES = ["/login", "/register", "/api/auth", "/api/health"];

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next(); // "/" = public landing page
  if (!req.auth?.user) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webmanifest)$).*)"],
};
