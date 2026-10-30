import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prefillFromExtraction, type Extraction, type Prefill } from "@/domain/cert-extraction";
import { formatDate, toDateInput } from "@/domain/india/format";
import { permissibleFromTolerance } from "@/domain/readings";
import { aiCertExtractionEnabled } from "@/server/ai/cert-extraction";
import { requirePermission } from "@/server/context";
import { scopeCheck, verificationInclude } from "@/server/services/verification";
import { tenantDb } from "@/server/tenant";
import { VerifyWorkbench } from "./verify-workbench";

export const metadata: Metadata = { title: "Verify certificate" };

export default async function VerifyPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const ctx = await requirePermission("certificate.verify");
  const t = await getTranslations("verification");
  const db = tenantDb(ctx.tenant);
  const job = await db.calibrationJob.findUnique({ where: { id: jobId }, include: verificationInclude });
  if (!job) notFound();
  if (!ctx.can("certificate.verify", job.plantId)) notFound();
  // Not a redirect: this page re-renders right after a decision, while the client navigates on.
  if (job.status !== "CERT_UPLOADED")
    return (
      <div className="space-y-3">
        <p className="text-sm">{t("notPending", { code: job.instrument.code })}</p>
        <div className="flex gap-4 text-sm">
          <Link href="/verification" className="underline underline-offset-4">
            {t("back")}
          </Link>
          {job.ootCases[0] && (
            <Link href={`/verification/oot/${job.ootCases[0].id}`} className="underline underline-offset-4">
              {t("ootCases")}
            </Link>
          )}
          <Link href={`/instruments/${job.instrument.id}`} className="underline underline-offset-4">
            {job.instrument.code}
          </Link>
        </div>
      </div>
    );

  const i = job.instrument;
  const autoScope = await scopeCheck(db, job.vendorId, i);
  const defaultPermissible =
    i.tolerancePlus?.toNumber() ??
    permissibleFromTolerance(i.acceptanceCriteria ?? i.type.defaultTolerance, {
      min: i.rangeMin?.toNumber() ?? null,
      max: i.rangeMax?.toNumber() ?? null,
    });
  const stored = job.aiExtraction as (Extraction & { extractedAt?: string; fileId?: string }) | null;
  const prefill: Prefill | null =
    stored && stored.fileId === job.certificateFileId
      ? prefillFromExtraction(stored, { instrumentSerial: i.serialNo, defaultPermissible })
      : null;
  const range =
    i.rangeMin != null || i.rangeMax != null
      ? `${i.rangeMin?.toString() ?? ""}–${i.rangeMax?.toString() ?? ""} ${i.unit ?? ""}`.trim()
      : "—";
  const tolerance =
    i.tolerancePlus != null || i.toleranceMinus != null
      ? `+${i.tolerancePlus?.toString() ?? "?"} / −${i.toleranceMinus?.toString() ?? "?"} ${i.unit ?? ""}`
      : (i.acceptanceCriteria ?? i.type.defaultTolerance ?? "—");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-muted-foreground text-sm">
          <Link href="/verification" className="hover:underline">
            {t("back")}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="font-mono">{i.code}</span> · {job.vendor?.name ?? t("inHouse")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("instrumentInfo", { type: i.type.name, range, serial: i.serialNo ?? "—" })} · {t("tolerance")}: {tolerance} ·{" "}
          {t("lastCal")}: {formatDate(i.lastCalibratedAt)} · {t("sentOn")}: {formatDate(job.sentAt)}
          {job.challanItem && ` · ${t("challan")} ${job.challanItem.challan.number}`}
        </p>
        {job.certRejectedAt && job.certRejectionReason && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {t("previousRejection", { date: formatDate(job.certRejectedAt), reason: job.certRejectionReason })}
          </p>
        )}
      </div>
      <VerifyWorkbench
        job={{
          id: job.id,
          code: i.code,
          instrumentId: i.id,
          serialNo: i.serialNo,
          nablRequired: i.nablRequired,
          sentAt: job.sentAt?.toISOString() ?? null,
          receivedAt: job.receivedAt?.toISOString() ?? null,
          certificateFileId: job.certificateFileId,
          vendorNablCertNo: job.vendor?.nablCertNo ?? null,
          vendorIsNabl: job.vendor?.accreditationType === "NABL",
          autoScope,
          defaultPermissible,
          unit: i.unit,
        }}
        initial={{
          certificateNo: job.certificateNo ?? "",
          ulrNo: job.ulrNo ?? "",
          calibratedAt: toDateInput(job.calibratedAt),
          labAccreditationNo: job.labAccreditationNo ?? "",
          nablMarkPresent: job.nablMarkPresent,
        }}
        prefill={prefill}
        prefillDate={stored?.extractedAt ? formatDate(stored.extractedAt) : null}
        aiEnabled={aiCertExtractionEnabled()}
      />
    </div>
  );
}
