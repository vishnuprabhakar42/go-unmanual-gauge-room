import { getTranslations } from "next-intl/server";
import { REPORTS_ITEMS } from "@/components/shell/nav";
import { requireAnyPermission } from "@/server/context";
import { SettingsTabs } from "../settings/settings-tabs";

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireAnyPermission("report.view", "auditpack.generate");
  const t = await getTranslations("reports");
  return (
    <div className="space-y-6">
      <SettingsTabs
        tabs={REPORTS_ITEMS.map((i) => ({ href: i.href, label: t(i.label), exact: "exact" in i ? i.exact : false }))}
      />
      {children}
    </div>
  );
}
