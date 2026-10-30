import { getTranslations } from "next-intl/server";
import { DISPATCH_ITEMS } from "@/components/shell/nav";
import { requireAnyPermission } from "@/server/context";
import { SettingsTabs } from "../settings/settings-tabs";

export default async function DispatchLayout({ children }: { children: React.ReactNode }) {
  await requireAnyPermission("dispatch.manage", "receipt.manage");
  const t = await getTranslations("dispatch");
  return (
    <div className="space-y-6">
      <SettingsTabs
        tabs={DISPATCH_ITEMS.map((i) => ({ href: i.href, label: t(i.label), exact: "exact" in i ? i.exact : false }))}
      />
      {children}
    </div>
  );
}
