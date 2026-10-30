import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t("notFoundTitle")}</h1>
      <Button asChild>
        <Link href="/dashboard">{t("goHome")}</Link>
      </Button>
    </main>
  );
}
