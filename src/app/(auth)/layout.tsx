import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  return (
    <main className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <Link href="/" aria-label={t("name")}>
          <Logo className="size-12" />
        </Link>
        <p className="text-muted-foreground text-sm">{t("tagline")}</p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
