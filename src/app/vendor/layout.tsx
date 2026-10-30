import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { signOutAction } from "@/components/shell/actions";
import { Logo } from "@/components/shell/logo";
import { PORTAL_ITEMS } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { requireVendorContext } from "@/server/vendor-portal/context";
import { SettingsTabs } from "../(app)/settings/settings-tabs";

export const metadata: Metadata = { title: { default: "Lab portal", template: "%s · Lab portal" } };

/** Separate, mobile-first shell for lab staff (never shows the customer's internal app). */
export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireVendorContext();
  const t = await getTranslations("portal");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Logo className="size-7" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("title")}</div>
            <div className="text-muted-foreground truncate text-xs">{ctx.vendors.map((v) => v.name).join(", ")}</div>
          </div>
          <form action={signOutAction}>
            <Button variant="ghost" size="sm" className="h-10" type="submit">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">{t("signOut")}</span>
            </Button>
          </form>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          <SettingsTabs
            tabs={PORTAL_ITEMS.map((i) => ({ href: i.href, label: t(i.label), exact: "exact" in i ? i.exact : false }))}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
