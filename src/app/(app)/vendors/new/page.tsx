import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { requirePermission } from "@/server/context";
import { VendorForm } from "../vendor-form";

export const metadata: Metadata = { title: "Add vendor" };

export default async function NewVendorPage() {
  await requirePermission("vendor.manage");
  const t = await getTranslations("vendors");
  return (
    <>
      <PageHeader title={t("newTitle")} />
      <VendorForm
        defaults={{
          name: "",
          gstin: "",
          pan: "",
          address: "",
          stateCode: "",
          contacts: [{ name: "", email: "", phone: "", isPrimary: true }],
          accreditationType: "NABL",
          nablCertNo: "",
          nablValidUntil: "",
          onsiteCapable: false,
          isApproved: true,
          evaluationNotes: "",
        }}
      />
    </>
  );
}
