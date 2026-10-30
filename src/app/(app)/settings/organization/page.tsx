import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { parseOrgSettings } from "@/domain/settings";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { OrganizationForm } from "./organization-form";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage() {
  const ctx = await requirePermission("org.manage");
  const t = await getTranslations("settings");
  const org = await tenantDb(ctx.tenant).organization.findUniqueOrThrow({ where: { id: ctx.org.id } });
  const settings = parseOrgSettings(org.settings);
  return (
    <>
      <PageHeader title={t("orgTitle")} subtitle={t("orgSubtitle")} />
      <OrganizationForm
        defaults={{
          organization: { name: org.name, gstin: org.gstin ?? "", pan: org.pan ?? "", address: org.address ?? "" },
          settings: {
            dueSoonDays: settings.dueSoonDays,
            requireRequestApproval: settings.requireRequestApproval,
            challanCopies: settings.challanCopies,
          },
        }}
      />
    </>
  );
}
