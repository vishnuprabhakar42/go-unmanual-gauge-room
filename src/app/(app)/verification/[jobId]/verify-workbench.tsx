"use client";

import { AlertTriangle, Check, CircleDashed, ExternalLink, Minus, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Prefill } from "@/domain/cert-extraction";
import { formatDate } from "@/domain/india/format";
import { computeReading, draftToReading, overallResult, parseReadingsPaste, type ReadingInputDraft } from "@/domain/readings";
import { checklistOutcome, evaluateChecklist, type CheckStatus } from "@/domain/verification-checklist";
import { cn } from "@/lib/utils";
import { extractCertificateAction, rejectCertificateAction, verifyAction } from "../actions";

type Job = {
  id: string;
  code: string;
  instrumentId: string;
  serialNo: string | null;
  nablRequired: boolean;
  sentAt: string | null;
  receivedAt: string | null;
  certificateFileId: string | null;
  vendorNablCertNo: string | null;
  vendorIsNabl: boolean;
  autoScope: boolean | null;
  defaultPermissible: number | null;
  unit: string | null;
};
type Initial = {
  certificateNo: string;
  ulrNo: string;
  calibratedAt: string;
  labAccreditationNo: string;
  nablMarkPresent: boolean | null;
};
type Tri = boolean | null;

const blankRow = (n: number, permissible: number | null): ReadingInputDraft => ({
  pointLabel: `Point ${n}`,
  nominal: "",
  asFound: "",
  asLeft: "",
  permissibleError: permissible == null ? "" : String(permissible),
  uncertainty: "",
});
const parseDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+05:30`) : null);

export function VerifyWorkbench({
  job,
  initial,
  prefill,
  prefillDate,
  aiEnabled,
}: {
  job: Job;
  initial: Initial;
  prefill: Prefill | null;
  prefillDate: string | null;
  aiEnabled: boolean;
}) {
  const t = useTranslations("verification");
  const tc = useTranslations("checklist");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState(() => ({
    certificateNo: prefill?.certificateNo || initial.certificateNo,
    ulrNo: prefill?.ulrNo || initial.ulrNo,
    calibratedAt: prefill?.calibratedAt || initial.calibratedAt,
    labAccreditationNo: prefill?.labAccreditationNo || initial.labAccreditationNo,
  }));
  const [nablMark, setNablMark] = useState<Tri>(prefill?.nablMarkPresent ?? initial.nablMarkPresent);
  const [uncertainty, setUncertainty] = useState<Tri>(null);
  const [scopeConfirmed, setScopeConfirmed] = useState<Tri>(null);
  const [rows, setRows] = useState<ReadingInputDraft[]>(() =>
    prefill?.readings.length ? prefill.readings : [1, 2, 3].map((n) => blankRow(n, job.defaultPermissible)),
  );
  const [low, setLow] = useState<Set<string>>(() => new Set(prefill?.lowConfidence ?? []));
  const [serialMismatch, setSerialMismatch] = useState<string | null>(prefill?.serialMismatch ? "?" : null);
  const [aiNote, setAiNote] = useState<string | null>(prefill && prefillDate ? t("prefilledFrom", { date: prefillDate }) : null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setLow((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : s));
  };

  const computed = useMemo(
    () =>
      rows.map((d) => {
        const r = draftToReading(d);
        return typeof r === "string" ? null : computeReading(r);
      }),
    [rows],
  );
  const complete = computed.length > 0 && computed.every((c) => c != null);
  const overall = complete ? overallResult(computed.filter((c) => c != null)) : null;
  const items = evaluateChecklist({
    nablRequired: job.nablRequired,
    certificateNo: f.certificateNo,
    ulrNo: f.ulrNo,
    calibratedAt: parseDate(f.calibratedAt),
    sentAt: job.sentAt ? new Date(job.sentAt) : null,
    receivedAt: job.receivedAt ? new Date(job.receivedAt) : null,
    nablMarkPresent: nablMark,
    labAccreditationNo: f.labAccreditationNo,
    vendorNablCertNo: job.vendorNablCertNo,
    vendorIsNabl: job.vendorIsNabl,
    withinScope: job.autoScope ?? scopeConfirmed,
    uncertaintyStated: uncertainty,
    readingsResult: overall?.result ?? null,
  });
  const outcome = checklistOutcome(items);

  const extract = () =>
    start(async () => {
      const res = await extractCertificateAction(job.id);
      if (!res.ok) return void toast.error(res.error);
      const p = res.data;
      if (!p) return void toast.warning(t("extractNone"));
      setF({
        certificateNo: p.certificateNo,
        ulrNo: p.ulrNo,
        calibratedAt: p.calibratedAt,
        labAccreditationNo: p.labAccreditationNo,
      });
      setNablMark(p.nablMarkPresent);
      if (p.readings.length) setRows(p.readings);
      setLow(new Set(p.lowConfidence));
      setSerialMismatch(p.serialMismatch ? "?" : null);
      setAiNote(t("extracted"));
      toast.success(t("extracted"));
    });

  const submit = () =>
    start(async () => {
      const tri = (v: Tri) => (v == null ? "" : v ? "yes" : "no") as "" | "yes" | "no";
      const res = await verifyAction({
        jobId: job.id,
        ...f,
        nablMarkPresent: tri(nablMark),
        uncertaintyStated: tri(uncertainty),
        scopeConfirmed: tri(scopeConfirmed),
        readings: rows,
      });
      if (!res.ok) return void toast.error(res.error);
      if (res.data.result === "PASS") {
        toast.success(t("passed", { code: job.code, date: formatDate(res.data.nextDueAt) }));
        if (res.data.ootCaseId) toast.warning(t("asFoundOot"));
        router.push(`/verification?reprint=${job.instrumentId}&code=${encodeURIComponent(job.code)}`);
      } else {
        toast.error(t("failed", { code: job.code }));
        router.push(`/verification/oot/${res.data.ootCaseId}`);
      }
    });

  const reject = () =>
    start(async () => {
      const res = await rejectCertificateAction({ jobId: job.id, reason });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("rejected"));
      setRejectOpen(false);
      router.push("/verification");
    });

  const applyPaste = () => {
    const { rows: parsed, errors } = parseReadingsPaste(pasteText);
    if (parsed.length) {
      setRows(
        parsed.map((r) => ({
          ...r,
          permissibleError: r.permissibleError || (job.defaultPermissible == null ? "" : String(job.defaultPermissible)),
        })),
      );
      toast.success(t("pasted", { count: parsed.length }));
    }
    if (errors.length) toast.warning(t("pasteErrors", { count: errors.length }), { description: errors.slice(0, 3).join("\n") });
    setPasteOpen(false);
    setPasteText("");
  };

  const lowHint = (k: string) =>
    low.has(k) ? (
      <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" data-testid={`low-${k}`}>
        <AlertTriangle className="size-3" aria-hidden="true" />
        {t("lowConfidence")}
      </p>
    ) : null;
  const lowCls = (k: string) => (low.has(k) ? "border-amber-500 ring-1 ring-amber-500/40" : "");
  const pdfUrl = job.certificateFileId ? `/api/attachments/${job.certificateFileId}` : null;
  const accreditationItem = items.find((i) => i.key === "accreditationMatches");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section aria-label={t("certificate")} className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        {pdfUrl ? (
          <div className="space-y-2">
            <iframe
              src={`${pdfUrl}#view=FitH&navpanes=0`}
              title={t("certificate")}
              className="h-[70vh] w-full rounded-md border bg-white lg:h-[calc(100vh-8rem)]"
            />
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t("openPdf")}
            </a>
          </div>
        ) : (
          <p className="text-muted-foreground rounded-md border p-6 text-sm">{t("noPdf")}</p>
        )}
      </section>

      <div className="min-w-0 space-y-4">
        {aiEnabled && (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={extract} disabled={pending || !pdfUrl}>
                <Sparkles aria-hidden="true" />
                {pending ? t("extracting") : t("extract")}
              </Button>
              <p className="text-muted-foreground text-xs">{aiNote ?? t("aiNote")}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="certificateNo">{t("certificateNo")}</Label>
              <Input
                id="certificateNo"
                value={f.certificateNo}
                onChange={set("certificateNo")}
                className={lowCls("certificateNo")}
              />
              {lowHint("certificateNo")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ulrNo">{t("ulrNo")}</Label>
              <Input id="ulrNo" value={f.ulrNo} onChange={set("ulrNo")} className={cn("font-mono", lowCls("ulrNo"))} />
              {lowHint("ulrNo")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calibratedAt">{t("calibratedAt")}</Label>
              <Input
                id="calibratedAt"
                type="date"
                value={f.calibratedAt}
                onChange={set("calibratedAt")}
                className={lowCls("calibratedAt")}
              />
              {lowHint("calibratedAt")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="labAccreditationNo">{t("labAccreditationNo")}</Label>
              <Input
                id="labAccreditationNo"
                value={f.labAccreditationNo}
                onChange={set("labAccreditationNo")}
                className={cn("font-mono", lowCls("labAccreditationNo"))}
              />
              <p className="text-muted-foreground text-xs">
                {job.vendorNablCertNo ? t("labOnFile", { no: job.vendorNablCertNo }) : t("noNabl")}
              </p>
              {lowHint("labAccreditationNo")}
              {accreditationItem?.status === "fail" && accreditationItem.detail && (
                <p className="text-destructive text-xs">{accreditationItem.detail}</p>
              )}
            </div>
            {serialMismatch && (
              <p className="flex items-start gap-1 text-sm text-amber-700 sm:col-span-2 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("serialMismatch", { serial: job.serialNo ?? "—" })}
              </p>
            )}
            <YesNo
              id="nablMark"
              label={t("nablMark")}
              value={nablMark}
              onChange={setNablMark}
              yes={t("yes")}
              no={t("no")}
              highlight={low.has("nablMarkPresent")}
            />
            <YesNo
              id="uncertainty"
              label={t("uncertainty")}
              value={uncertainty}
              onChange={setUncertainty}
              yes={t("yes")}
              no={t("no")}
            />
            {job.autoScope == null && (
              <div className="sm:col-span-2">
                <YesNo
                  id="scope"
                  label={t("scopeConfirm")}
                  value={scopeConfirmed}
                  onChange={setScopeConfirmed}
                  yes={t("yes")}
                  no={t("no")}
                />
                <p className="text-muted-foreground mt-1 text-xs">{t("scopeNoData")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {t("readings")}
              {job.unit && <span className="text-muted-foreground ml-1 text-sm font-normal">({job.unit})</span>}
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
              {t("paste")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-xs">{t("readingsHint")}</p>
            {lowHint("readings")}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm" data-testid="readings-grid">
                <thead>
                  <tr className="text-muted-foreground text-left text-xs">
                    <th className="py-1 pr-2 font-medium">{t("point")}</th>
                    <th className="py-1 pr-2 font-medium">{t("nominal")}</th>
                    <th className="py-1 pr-2 font-medium">{t("asFound")}</th>
                    <th className="py-1 pr-2 font-medium">{t("asLeft")}</th>
                    <th className="py-1 pr-2 font-medium">{t("permissible")}</th>
                    <th className="py-1 pr-2 font-medium">{t("u")}</th>
                    <th className="py-1 pr-2 text-right font-medium">{t("error")}</th>
                    <th className="py-1 pr-2 font-medium">
                      <span className="sr-only">{t("result")}</span>
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const c = computed[idx];
                    const cell = (k: keyof ReadingInputDraft, cls = "w-[4.5rem]") => (
                      <td className="py-1 pr-1.5">
                        <Input
                          aria-label={`${t(k === "pointLabel" ? "point" : k === "permissibleError" ? "permissible" : k === "uncertainty" ? "u" : k)} ${idx + 1}`}
                          value={r[k]}
                          inputMode={k === "pointLabel" ? undefined : "decimal"}
                          onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, [k]: e.target.value } : x)))}
                          className={cn("h-8 tabular-nums", cls)}
                        />
                      </td>
                    );
                    return (
                      <tr key={idx} className={cn(c && !c.pass && "bg-red-50 dark:bg-red-950/40")}>
                        {cell("pointLabel", "w-20")}
                        {cell("nominal")}
                        {cell("asFound")}
                        {cell("asLeft")}
                        {cell("permissibleError")}
                        {cell("uncertainty", "w-14")}
                        <td className="py-1 pr-2 text-right font-mono tabular-nums">
                          {c ? (c.error > 0 ? "+" : "") + c.error : "—"}
                        </td>
                        <td className="py-1 pr-2">
                          {c && (
                            <div className="text-xs font-medium whitespace-nowrap">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1",
                                  c.pass ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
                                )}
                              >
                                {c.pass ? (
                                  <Check className="size-3.5" aria-hidden="true" />
                                ) : (
                                  <X className="size-3.5" aria-hidden="true" />
                                )}
                                {c.pass ? (c.marginal ? t("marginal") : t("pass")) : t("fail")}
                              </span>
                              {c.asFoundPass === false && (
                                <div className="font-normal text-amber-700 dark:text-amber-400">
                                  {t("asFound")}: {t("fail").toLowerCase()}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={t("removeRow", { n: idx + 1 })}
                            disabled={rows.length <= 1}
                            onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows((rs) => [...rs, blankRow(rs.length + 1, job.defaultPermissible)])}
            >
              <Plus aria-hidden="true" />
              {t("addRow")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("checklist")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="checklist">
              {items.map((i) => (
                <li key={i.key} className="flex items-start gap-2 text-sm" data-status={i.status}>
                  <StatusIcon status={i.status} />
                  <span>
                    {tc(i.key)}
                    <span className="text-muted-foreground"> — {tc(i.status)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {overall && (
              <div className="rounded-md border p-3 text-sm" data-testid="computed-result">
                <span className="text-muted-foreground">{t("computedResult")}: </span>
                <b
                  className={
                    overall.result === "PASS" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                  }
                >
                  {t(overall.result)}
                </b>
                {overall.failedPoints > 0 && (
                  <span className="text-muted-foreground"> · {t("failedPoints", { count: overall.failedPoints })}</span>
                )}
                {overall.asFoundFailed && overall.result === "PASS" && (
                  <p className="mt-1 text-amber-700 dark:text-amber-400">{t("asFoundFailed")}</p>
                )}
              </div>
            )}
            {outcome.mustReject && (
              <p className="text-destructive text-sm">
                {t("mustReject", { items: outcome.documentFailures.map((k) => tc(k)).join(", ") })}
              </p>
            )}
            {!outcome.mustReject && outcome.pending.length > 0 && (
              <p className="text-muted-foreground text-sm">
                {t("pending", { items: outcome.pending.map((k) => tc(k)).join(", ") })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={submit}
                disabled={pending || !outcome.canDecide || !overall}
                variant={overall?.result === "FAIL" ? "destructive" : "default"}
              >
                {overall?.result === "FAIL" ? t("recordFail") : t("recordPass")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setRejectOpen(true)} disabled={pending}>
                {t("reject")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pasteTitle")}</DialogTitle>
            <DialogDescription>{t("pasteHint")}</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={t("pasteTitle")}
            rows={8}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button type="button" onClick={applyPaste} disabled={!pasteText.trim()}>
              {t("pasteApply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectTitle", { code: job.code })}</DialogTitle>
            <DialogDescription>{t("rejectHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reason">{t("reason")}</Label>
            <Textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="destructive" onClick={reject} disabled={pending || reason.trim().length < 5}>
              {t("rejectConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusIcon({ status }: { status: CheckStatus }) {
  const cls = "mt-0.5 size-4 shrink-0";
  if (status === "pass") return <Check className={cn(cls, "text-emerald-600 dark:text-emerald-400")} aria-hidden="true" />;
  if (status === "fail") return <X className={cn(cls, "text-red-600 dark:text-red-400")} aria-hidden="true" />;
  if (status === "na") return <Minus className={cn(cls, "text-muted-foreground")} aria-hidden="true" />;
  return <CircleDashed className={cn(cls, "text-muted-foreground")} aria-hidden="true" />;
}

function YesNo({
  id,
  label,
  value,
  onChange,
  yes,
  no,
  highlight,
}: {
  id: string;
  label: string;
  value: Tri;
  onChange: (v: Tri) => void;
  yes: string;
  no: string;
  highlight?: boolean;
}) {
  return (
    <fieldset className={cn("space-y-1.5", highlight && "rounded-md ring-1 ring-amber-500/60")}>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {([true, false] as const).map((v) => (
          <Button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            id={`${id}-${v ? "yes" : "no"}`}
            variant={value === v ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(value === v ? null : v)}
          >
            {v ? yes : no}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
