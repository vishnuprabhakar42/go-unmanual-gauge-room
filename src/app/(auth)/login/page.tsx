import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const params = await searchParams;
  if (await getSessionUser()) redirect(params.callbackUrl ?? "/dashboard");
  return <LoginForm callbackUrl={params.callbackUrl} initialError={params.error} />;
}
