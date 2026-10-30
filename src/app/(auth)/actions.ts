"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { registerSchema } from "@/domain/schemas";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/passwords";
import { AUTH_LIMITS, rateLimit } from "@/server/rate-limit";
import { ipFromHeaders } from "@/server/request";

export type AuthFormResult =
  { ok: false; error: "invalid" | "rate_limited" | "link_failed" | "email_taken" | "validation" } | undefined;

function safeCallback(url: string | undefined): string {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/dashboard";
}

function authErrorCode(err: AuthError): "invalid" | "rate_limited" {
  const code = (err as AuthError & { code?: string }).code;
  return code === "rate_limited" ? "rate_limited" : "invalid";
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
  callbackUrl?: string;
}): Promise<AuthFormResult> {
  try {
    await signIn("credentials", { email: input.email, password: input.password, redirectTo: safeCallback(input.callbackUrl) });
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: authErrorCode(err) };
    throw err; // NEXT_REDIRECT on success
  }
}

export async function sendMagicLink(input: { email: string; callbackUrl?: string }): Promise<AuthFormResult> {
  try {
    await signIn("nodemailer", { email: input.email.trim().toLowerCase(), redirectTo: safeCallback(input.callbackUrl) });
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: "link_failed" };
    throw err;
  }
}

/** Self-serve sign-up for a new company. Invited users are created by their admin instead. */
export async function registerAccount(raw: { name: string; email: string; password: string }): Promise<AuthFormResult> {
  const ip = ipFromHeaders(await headers()) ?? "unknown";
  const { limit, windowMs } = AUTH_LIMITS.register;
  if (!rateLimit(`register:${ip}`, limit, windowMs).ok) return { ok: false, error: "rate_limited" };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation" };
  const { name, email, password } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) return { ok: false, error: "email_taken" };

  // No organization exists yet, so this is audited when the org is created at /setup.
  await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  try {
    await signIn("credentials", { email, password, redirectTo: "/setup" });
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: authErrorCode(err) };
    throw err;
  }
}
