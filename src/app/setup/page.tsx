import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/shell/logo";
import { getAppContext, getSessionUser, isPortalUser } from "@/server/context";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (await getAppContext()) redirect("/dashboard");
  if (await isPortalUser(user.id)) redirect("/vendor");
  const t = await getTranslations("setup");
  return (
    <main className="bg-muted/40 flex min-h-dvh flex-col items-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo className="size-10" />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <SetupForm />
    </main>
  );
}
