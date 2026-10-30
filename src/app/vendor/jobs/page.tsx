import { getTranslations } from "next-intl/server";
import { LabJobsTable } from "@/components/lab/lab-jobs-table";
import { toLabRows } from "@/components/lab/rows";
import { PageHeader } from "@/components/data/page-header";
import { requireVendorContext } from "@/server/vendor-portal/context";
import { portalJobs } from "@/server/vendor-portal/data";
import { vendorLabProgressAction } from "../actions";

export default async function PortalJobs() {
  const ctx = await requireVendorContext();
  const t = await getTranslations();
  const jobs = await portalJobs(ctx);
  return (
    <>
      <PageHeader title={t("portal.jobs")} subtitle={t("lab.jobsSubtitle")} />
      {jobs.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("portal.noJobs")}</p>
      ) : (
        <LabJobsTable rows={toLabRows(jobs)} action={vendorLabProgressAction} showCustomer showLab={ctx.vendors.length > 1} />
      )}
    </>
  );
}
