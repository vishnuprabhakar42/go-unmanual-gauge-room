import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CertificateUploader } from "@/components/lab/certificate-uploader";
import { LabJobsTable } from "@/components/lab/lab-jobs-table";
import { toCandidates, toLabRows } from "@/components/lab/rows";
import { requireAnyPermission } from "@/server/context";
import { listLabJobs } from "@/server/services/lab-jobs";
import { tenantDb } from "@/server/tenant";
import { internalLabProgressAction, internalUploadCertificateAction } from "../actions";

export const metadata: Metadata = { title: "Lab jobs" };

/** Everything the lab portal does, done by the internal team for labs that never log in. */
export default async function LabJobsPage() {
  const ctx = await requireAnyPermission("receipt.manage", "certificate.verify");
  const t = await getTranslations("lab");
  const jobs = await listLabJobs(tenantDb(ctx.tenant), { plantId: ctx.currentPlantId });
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("jobsTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("jobsSubtitle")}</p>
      </div>
      <LabJobsTable rows={toLabRows(jobs)} action={internalLabProgressAction} showLab />
      <CertificateUploader
        candidates={toCandidates(jobs).map((c, i) => ({ ...c, label: `${c.label} · ${jobs[i]?.vendor?.name ?? ""}` }))}
        action={internalUploadCertificateAction}
      />
    </div>
  );
}
