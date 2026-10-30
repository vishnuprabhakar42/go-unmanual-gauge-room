import { getTranslations } from "next-intl/server";
import type { AppContext } from "@/server/context";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NAV_ITEMS } from "./nav";
import { PlantSwitcher } from "./plant-switcher";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export async function AppShell({ ctx, children }: { ctx: AppContext; children: React.ReactNode }) {
  const t = await getTranslations("app");
  const allowed = NAV_ITEMS.filter((i) => ctx.can(i.permission)).map((i) => i.href);
  const roles = [...new Set(ctx.grants.map((g) => g.role))];
  return (
    <div className="flex min-h-dvh">
      <aside className="bg-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r lg:flex">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Logo className="size-9" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 text-sm">
              <span className="font-semibold">{t("name")}</span>
              <span className="text-muted-foreground text-xs">{t("product")}</span>
            </div>
            <div className="text-muted-foreground truncate text-xs">{ctx.org.name}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav allowed={allowed} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 backdrop-blur sm:px-6">
          <MobileNav allowed={allowed} orgName={ctx.org.name} />
          <div className="flex-1">
            <PlantSwitcher plants={ctx.plants} currentPlantId={ctx.currentPlantId} allowAll={ctx.tenant.plantIds === "ALL"} />
          </div>
          <UserMenu name={ctx.user.name} email={ctx.user.email} roles={roles} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
