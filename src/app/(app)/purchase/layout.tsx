import { getTranslations } from "next-intl/server";
import { PURCHASE_ITEMS } from "@/components/shell/nav";
import { requireAnyPermission } from "@/server/context";
import { SettingsTabs } from "../settings/settings-tabs";

export default async function PurchaseLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAnyPermission("po.manage", "rfq.manage", "rateContract.manage", "quote.techApprove");
  const t = await getTranslations("purchase");
  const tabs = PURCHASE_ITEMS.filter((i) =>
    i.label === "rfqs"
      ? ctx.can("rfq.manage") || ctx.can("quote.techApprove")
      : i.label === "contracts"
        ? ctx.can("rateContract.manage")
        : ctx.can("po.manage"),
  );
  return (
    <div className="space-y-6">
      <SettingsTabs tabs={tabs.map((i) => ({ href: i.href, label: t(i.label) }))} />
      {children}
    </div>
  );
}
