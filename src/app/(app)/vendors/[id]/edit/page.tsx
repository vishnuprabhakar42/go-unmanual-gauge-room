import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { toDateInput } from "@/domain/india/format";
import type { Contact } from "@/domain/vendor-schemas";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { VendorForm } from "../../vendor-form";

export const metadata: Metadata = { title: "Edit vendor" };

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("vendor.manage");
  const t = await getTranslations("vendors");
  const v = await tenantDb(ctx.tenant).vendor.findUnique({
    where: { id },
    include: { links: { where: { organizationId: ctx.org.id } } },
  });
  if (!v) notFound();
  const link = v.links[0];
  return (
    <>
      <PageHeader title={`${t("edit")}: ${v.name}`} />
      <VendorForm
        vendorId={v.id}
        shared={v.ownerOrganizationId !== ctx.org.id}
        defaults={{
          name: v.name,
          gstin: v.gstin ?? "",
          pan: v.pan ?? "",
          address: v.address ?? "",
          stateCode: v.stateCode ?? "",
          contacts: ((v.contacts ?? []) as Contact[]).map((c) => ({
            name: c.name,
            email: c.email ?? "",
            phone: c.phone ?? "",
            isPrimary: !!c.isPrimary,
          })),
          accreditationType: v.accreditationType,
          nablCertNo: v.nablCertNo ?? "",
          nablValidUntil: toDateInput(v.nablValidUntil),
          onsiteCapable: v.onsiteCapable,
          isApproved: !!link?.isApproved,
          evaluationNotes: link?.evaluationNotes ?? "",
        }}
      />
    </>
  );
}
