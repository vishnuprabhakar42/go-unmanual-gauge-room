import { getTranslations } from "next-intl/server";
import { MASTERS_ITEMS } from "@/components/shell/nav";
import { requirePermission } from "@/server/context";
import { SettingsTabs } from "../settings/settings-tabs";

export default async function MastersLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("masters.manage");
  const t = await getTranslations("masters");
  return (
    <div className="space-y-6">
      <SettingsTabs tabs={MASTERS_ITEMS.map((i) => ({ href: i.href, label: t(i.label) }))} />
      {children}
    </div>
  );
}
