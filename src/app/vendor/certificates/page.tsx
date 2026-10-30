import { getTranslations } from "next-intl/server";
import { CertificateUploader } from "@/components/lab/certificate-uploader";
import { toCandidates } from "@/components/lab/rows";
import { PageHeader } from "@/components/data/page-header";
import { requireVendorContext } from "@/server/vendor-portal/context";
import { portalJobs } from "@/server/vendor-portal/data";
import { vendorUploadCertificateAction } from "../actions";

export default async function PortalCertificates() {
  const ctx = await requireVendorContext();
  const t = await getTranslations("portal");
  const jobs = await portalJobs(ctx);
  return (
    <>
      <PageHeader title={t("certificates")} />
      <CertificateUploader candidates={toCandidates(jobs)} action={vendorUploadCertificateAction} />
    </>
  );
}
