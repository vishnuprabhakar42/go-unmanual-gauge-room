import { getTranslations } from "next-intl/server";
import { SETTINGS_ITEMS } from "@/components/shell/nav";
import { requireContext } from "@/server/context";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const t = await getTranslations("settings");
  const tabs = SETTINGS_ITEMS.filter((i) => ctx.can(i.permission)).map((i) => ({ href: i.href, label: t(i.label) }));
  return (
    <div className="space-y-6">
      <SettingsTabs tabs={tabs} />
      {children}
    </div>
  );
}
