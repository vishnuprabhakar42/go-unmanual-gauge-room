import { getTranslations } from "next-intl/server";
import { VERIFICATION_ITEMS } from "@/components/shell/nav";
import { requireAnyPermission } from "@/server/context";
import { SettingsTabs } from "../settings/settings-tabs";

export default async function VerificationLayout({ children }: { children: React.ReactNode }) {
  await requireAnyPermission("certificate.verify", "oot.decide");
  const t = await getTranslations("verification");
  return (
    <div className="space-y-6">
      <SettingsTabs
        tabs={VERIFICATION_ITEMS.map((i) => ({ href: i.href, label: t(i.label), exact: "exact" in i ? i.exact : false }))}
      />
      {children}
    </div>
  );
}
