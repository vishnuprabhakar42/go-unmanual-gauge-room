import { Download, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OOT_TONE, RESULT_TONE, StatusPill } from "@/components/data/status-pill";
import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatINR } from "@/domain/india/format";
import { requirePermission } from "@/server/context";
import { calibrationHistory } from "@/server/services/calibration-history";
import { tenantDb } from "@/server/tenant";

export const metadata: Metadata = { title: "Calibration history" };

export default async function CalibrationHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("instrument.view");
  const t = await getTranslations();
  const h = await calibrationHistory(tenantDb(ctx.tenant), id);
  if (!h) notFound();
  const { instrument: i, entries, summary } = h;
  const tiles: [string, string][] = [
    [t("history.calibrations"), String(summary.calibrations)],
    [t("history.passFail"), `${summary.passed} / ${summary.failed}`],
    [t("history.totalCost"), formatINR(summary.totalCost)],
    [t("history.avgTat"), summary.avgTatDays == null ? "—" : t("history.days", { n: summary.avgTatDays })],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="text-muted-foreground text-sm">
            <Link href="/instruments" className="hover:underline">
              {t("instruments.title")}
            </Link>{" "}
            /{" "}
            <Link href={`/instruments/${i.id}`} className="font-mono hover:underline">
              {i.code}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("history.title", { code: i.code })}</h1>
          <p className="text-muted-foreground text-sm">
            {[i.type.name, i.make, i.serialNo && `SN ${i.serialNo}`].filter(Boolean).join(" · ")} ·{" "}
            {t("history.nextDue", { date: formatDate(i.nextDueAt) || "—" })}
          </p>
        </div>
        <Button asChild variant="outline" className="h-11">
          <a href={`/api/instruments/${i.id}/history`} data-testid="history-export">
            <Download aria-hidden="true" />
            {t("reports.export")}
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="history-summary">
        {tiles.map(([label, value]) => (
          <Card key={label} className="py-4">
            <CardContent className="px-4">
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className="text-xl font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={FileText} title={t("history.empty")} body={t("history.emptyBody")} />
      ) : (
        <ol className="space-y-4" data-testid="history-entries">
          {entries.map((e, n) => {
            const facts: [string, React.ReactNode][] = [
              [t("history.lab"), e.lab ? `${e.lab}${e.labAccreditation ? ` · ${e.labAccreditation}` : ""}` : null],
              [
                t("instruments.standard"),
                e.standardCode ? `${e.standardCode}${e.standardDate ? ` (${formatDate(e.standardDate)})` : ""}` : null,
              ],
              [
                t("history.po"),
                e.po ? (
                  <Link href={`/purchase/orders/${e.po.id}`} className="font-mono underline-offset-4 hover:underline">
                    {e.po.number}
                  </Link>
                ) : null,
              ],
              [t("history.poDate"), formatDate(e.po?.date ?? null)],
              [
                t("history.cost"),
                e.cost
                  ? t("history.costDetail", {
                      rate: formatINR(e.cost.rate),
                      gst: formatINR(e.cost.gst),
                      pct: e.cost.gstPercent,
                      total: formatINR(e.cost.total),
                    })
                  : null,
              ],
              [
                t("history.challan"),
                e.challan?.number ? (
                  <Link href={`/dispatch/challans/${e.challan.id}`} className="font-mono underline-offset-4 hover:underline">
                    {e.challan.number}
                  </Link>
                ) : null,
              ],
              [t("history.sent"), formatDate(e.sentAt)],
              [t("history.received"), formatDate(e.receivedAt)],
              [
                t("history.tat"),
                e.tatDays == null ? null : t("history.tatDetail", { days: e.tatDays, promised: e.promisedTatDays ?? "—" }),
              ],
              [
                t("history.certificate"),
                e.certificateNo ? (
                  e.certificateFileId ? (
                    <a
                      href={`/api/attachments/${e.certificateFileId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      {e.certificateNo} ↗
                    </a>
                  ) : (
                    e.certificateNo
                  )
                ) : null,
              ],
              [t("history.ulr"), e.ulrNo],
              [t("history.readings"), e.readings ? String(e.readings) : null],
              [t("history.verified"), e.verifiedBy ? `${e.verifiedBy} · ${formatDate(e.verifiedAt)}` : null],
              [t("history.nextDueSet"), formatDate(e.nextDueAt)],
            ];
            return (
              <li key={e.jobId ?? `manual-${n}`}>
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-center gap-2">
                    <CardTitle className="text-base">
                      {e.calibratedAt ? t("history.calibratedOn", { date: formatDate(e.calibratedAt) }) : t("history.inProgress")}
                    </CardTitle>
                    {e.result && (
                      <StatusPill label={t(`verification.${e.result as "PASS"}`)} tone={RESULT_TONE[e.result] ?? "neutral"} />
                    )}
                    {e.status && !e.result && <StatusPill label={t(`jobStatus.${e.status as "AT_LAB"}`)} tone="info" />}
                    {e.oot.map((o) => (
                      <Link key={o.id} href={`/verification/oot/${o.id}`} className="inline-flex items-center gap-1 text-sm">
                        <StatusPill label={`OOT · ${t(`ootStatus.${o.status as "OPEN"}`)}`} tone={OOT_TONE[o.status]} />
                        {o.disposition && (
                          <span className="text-muted-foreground">{t(`ootDisposition.${o.disposition as "ADJUSTED"}`)}</span>
                        )}
                      </Link>
                    ))}
                  </CardHeader>
                  <CardContent>
                    {e.manual ? (
                      <p className="text-muted-foreground text-sm">{t("history.manual")}</p>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                        {facts.map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="text-muted-foreground text-xs">{label}</dt>
                            <dd className="text-sm break-words">
                              {value === null || value === undefined || value === "" ? "—" : value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
