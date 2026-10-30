import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function Forbidden() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldAlert className="text-muted-foreground size-10" />
      <h1 className="text-xl font-semibold">{t("forbiddenTitle")}</h1>
      <p className="text-muted-foreground text-sm">{t("forbiddenBody")}</p>
      <Button asChild>
        <Link href="/dashboard">{t("goHome")}</Link>
      </Button>
    </main>
  );
}
