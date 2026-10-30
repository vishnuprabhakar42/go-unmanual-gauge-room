"use client";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ImportFieldKey } from "@/domain/import/fields";
import type { ColumnMapping } from "@/domain/import/mapping";
import { cellText } from "@/domain/import/values";
import { cn } from "@/lib/utils";
import { aiMappingAction, analyzeFileAction, commitImportAction, dryRunAction, type AnalyzedFile, type DryRun } from "./actions";

type Field = { key: ImportFieldKey; label: string; required: boolean };
type Step = 1 | 2 | 3 | 4;
type Outcome = { created: number; updated: number; skipped: number };

const IGNORE = "__ignore__";

/** column index → field (inverse of ColumnMapping) */
function byColumn(mapping: ColumnMapping): Map<number, ImportFieldKey> {
  return new Map(Object.entries(mapping).map(([field, col]) => [col as number, field as ImportFieldKey]));
}

export function ImportWizard({
  plants,
  defaultPlantId,
  fields,
}: {
  plants: { id: string; label: string }[];
  defaultPlantId: string;
  fields: Field[];
}) {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const ti = useTranslations("instruments");
  const [step, setStep] = useState<Step>(1);
  const [pending, start] = useTransition();
  const [file, setFile] = useState<AnalyzedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [autoMapped, setAutoMapped] = useState<Set<ImportFieldKey>>(new Set());
  const [plantId, setPlantId] = useState(defaultPlantId);
  const [createMissingTypes, setCreateMissingTypes] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => byColumn(mapping), [mapping]);
  const missingRequired = fields.filter((f) => f.required && mapping[f.key] === undefined);

  const payload = () => ({
    rows: file!.rows,
    mapping,
    firstDataRow: file!.firstDataRow,
    defaultPlantId: plantId,
    options: { createMissingTypes, updateExisting },
    fileName: file!.fileName,
  });

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const res = await analyzeFileAction(fd);
      if (!res.ok) return void setError(res.error);
      setFile(res.data);
      setMapping(res.data.mapping);
      setAutoMapped(new Set(Object.keys(res.data.mapping) as ImportFieldKey[]));
      setStep(2);
    });
  };

  const setColumnField = (col: number, value: string) => {
    setMapping((prev) => {
      const next: ColumnMapping = {};
      for (const [k, v] of Object.entries(prev)) if (v !== col && k !== value) next[k as ImportFieldKey] = v;
      if (value !== IGNORE) next[value as ImportFieldKey] = col;
      return next;
    });
    setAutoMapped((prev) => {
      const next = new Set(prev);
      next.delete(value as ImportFieldKey);
      return next;
    });
  };

  const askAi = () =>
    start(async () => {
      const suggestion = await aiMappingAction({ headers: file!.headers, sample: file!.rows.slice(0, 5) });
      if (!suggestion) return void toast.error("AI suggestion unavailable — keeping the automatic match.");
      setMapping(suggestion);
      setAutoMapped(new Set(Object.keys(suggestion) as ImportFieldKey[]));
    });

  const runDry = () =>
    start(async () => {
      const res = await dryRunAction(payload());
      if (!res.ok) return void toast.error(res.error);
      setDryRun(res.data);
      setStep(3);
    });

  const runImport = () =>
    start(async () => {
      const res = await commitImportAction(payload());
      if (!res.ok) return void toast.error(res.error);
      setOutcome(res.data);
      setStep(4);
    });

  const downloadReport = () => {
    if (!dryRun) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ["Row,Code,Severity,Field,Problem"];
    for (const r of dryRun.issues) {
      for (const e of r.errors) lines.push([r.row, esc(r.code), "error", e.field, esc(e.message)].join(","));
      for (const w of r.warnings) lines.push([r.row, esc(r.code), "warning", w.field, esc(w.message)].join(","));
    }
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-report-${file?.fileName.replace(/\.[^.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const steps = [t("step1"), t("step2"), t("step3"), t("step4")];
  const importable = dryRun ? dryRun.summary.create + dryRun.summary.update : 0;

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Progress">
        {steps.map((label, i) => (
          <li
            key={label}
            className={cn(
              "rounded-full border px-3 py-1",
              step === i + 1
                ? "bg-primary text-primary-foreground border-primary"
                : step > i + 1
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
            aria-current={step === i + 1 ? "step" : undefined}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 1 && (
        <Card>
          <CardContent>
            <label
              htmlFor="import-file"
              className="hover:bg-muted/50 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center"
            >
              {pending ? (
                <Loader2 className="text-muted-foreground size-8 animate-spin" />
              ) : (
                <Upload className="text-muted-foreground size-8" />
              )}
              <span className="font-medium">{pending ? t("reading") : t("drop")}</span>
              <span className="text-muted-foreground text-sm">{t("dropHint")}</span>
              <input
                id="import-file"
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                disabled={pending}
                onChange={(e) => onFile(e.target.files?.[0])}
                data-testid="import-file"
              />
            </label>
          </CardContent>
        </Card>
      )}

      {step === 2 && file && (
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="size-4" />
              {file.fileName}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {t("sheet", { name: file.sheetName, row: file.headerRow, count: file.rows.length })}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {file.aiAvailable && (
              <Button variant="outline" size="sm" onClick={askAi} disabled={pending}>
                <Sparkles className="size-4" />
                {t("aiSuggest")}
              </Button>
            )}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("column")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("sample")}</TableHead>
                    <TableHead>{t("mapsTo")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {file.headers.map((header, col) => {
                    const field = columns.get(col);
                    const samples = file.rows
                      .map((r) => cellText(r[col]))
                      .filter(Boolean)
                      .slice(0, 3);
                    return (
                      <TableRow key={col}>
                        <TableCell className="font-medium">{header}</TableCell>
                        <TableCell className="text-muted-foreground hidden max-w-xs truncate text-xs md:table-cell">
                          {samples.join(" · ")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select value={field ?? IGNORE} onValueChange={(v) => setColumnField(col, v)}>
                              <SelectTrigger
                                className="h-10 w-56"
                                aria-label={`${t("mapsTo")}: ${header}`}
                                data-testid={`map-${col}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={IGNORE}>{t("ignore")}</SelectItem>
                                {fields.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                    {f.required ? " *" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {field && autoMapped.has(field) && (
                              <Badge variant="outline" className="text-[10px]">
                                {t("auto")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="default-plant">{t("defaultPlant")}</Label>
                <Select value={plantId} onValueChange={setPlantId}>
                  <SelectTrigger id="default-plant" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <fieldset className="space-y-1">
                <legend className="mb-1 text-sm font-medium">{t("options")}</legend>
                <div className="flex min-h-11 items-start gap-3">
                  <Checkbox
                    id="opt-types"
                    checked={createMissingTypes}
                    onCheckedChange={(v) => setCreateMissingTypes(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="opt-types" className="font-normal">
                    {t("createTypes")}
                  </Label>
                </div>
                <div className="flex min-h-11 items-start gap-3">
                  <Checkbox
                    id="opt-update"
                    checked={updateExisting}
                    onCheckedChange={(v) => setUpdateExisting(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="opt-update" className="font-normal">
                    {t("updateExisting")}
                  </Label>
                </div>
              </fieldset>
            </div>

            {missingRequired.length > 0 && (
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  {t("missingRequired", { fields: missingRequired.map((f) => f.label).join(", ") })}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button className="h-11" onClick={runDry} disabled={pending || missingRequired.length > 0}>
                {pending ? t("checking") : t("dryRun")}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setStep(1)} disabled={pending}>
                {tc("back")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && dryRun && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="dry-run-summary">
            <SummaryTile label={t("willCreate")} value={dryRun.summary.create} tone="good" />
            <SummaryTile label={t("willUpdate")} value={dryRun.summary.update} />
            <SummaryTile label={t("rowErrors")} value={dryRun.summary.errors} tone={dryRun.summary.errors ? "bad" : undefined} />
            <SummaryTile
              label={t("rowWarnings")}
              value={dryRun.summary.withWarnings}
              tone={dryRun.summary.withWarnings ? "warn" : undefined}
            />
          </div>
          {(dryRun.summary.missingTypes.length > 0 ||
            dryRun.summary.newDepartments.length > 0 ||
            dryRun.summary.newLocations.length > 0) && (
            <Card>
              <CardContent className="space-y-2 text-sm">
                {dryRun.summary.missingTypes.length > 0 && (
                  <p>
                    <span className="font-medium">{t("newTypes")}:</span> {dryRun.summary.missingTypes.join(", ")}
                  </p>
                )}
                {dryRun.summary.newDepartments.length > 0 && (
                  <p>
                    <span className="font-medium">{t("newDepartments")}:</span> {dryRun.summary.newDepartments.join(", ")}
                  </p>
                )}
                {dryRun.summary.newLocations.length > 0 && (
                  <p>
                    <span className="font-medium">{t("newLocations")}:</span> {dryRun.summary.newLocations.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {dryRun.issues.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{t("errorsTitle")}</CardTitle>
                <Button variant="outline" size="sm" onClick={downloadReport}>
                  <Download className="size-4" />
                  {t("downloadReport")}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto rounded-md border">
                  <Table data-testid="issues-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("row")}</TableHead>
                        <TableHead>{ti("code")}</TableHead>
                        <TableHead>{t("field")}</TableHead>
                        <TableHead>{t("problem")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dryRun.issues.slice(0, 300).flatMap((r) => [
                        ...r.errors.map((e, i) => (
                          <TableRow key={`${r.row}-e${i}`}>
                            <TableCell>{r.row}</TableCell>
                            <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                            <TableCell className="text-xs">{e.field}</TableCell>
                            <TableCell className="text-destructive text-sm">{e.message}</TableCell>
                          </TableRow>
                        )),
                        ...r.warnings.map((w, i) => (
                          <TableRow key={`${r.row}-w${i}`}>
                            <TableCell>{r.row}</TableCell>
                            <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                            <TableCell className="text-xs">{w.field}</TableCell>
                            <TableCell className="text-sm text-amber-700 dark:text-amber-400">{w.message}</TableCell>
                          </TableRow>
                        )),
                      ])}
                    </TableBody>
                  </Table>
                </div>
                {dryRun.issues.length > 300 && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {t("onlyProblems", { shown: 300, total: dryRun.issues.length })}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {importable === 0 && (
            <Alert variant="destructive">
              <AlertDescription>{t("noValid")}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button className="h-11" onClick={runImport} disabled={pending || importable === 0}>
              {pending ? t("importing") : t("importNow", { count: importable })}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setStep(2)} disabled={pending}>
              {tc("back")}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && outcome && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="size-10 text-emerald-600" />
            <h2 className="text-lg font-semibold">{t("doneTitle")}</h2>
            <p className="text-muted-foreground" data-testid="import-outcome">
              {t("doneBody", outcome)}
            </p>
            <div className="flex gap-2">
              <Button asChild className="h-11">
                <Link href="/instruments">{t("viewInstruments")}</Link>
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setFile(null);
                  setDryRun(null);
                  setOutcome(null);
                  setStep(1);
                }}
              >
                {t("importAnother")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "warn" }) {
  return (
    <Card className="py-4">
      <CardContent>
        <div className="text-muted-foreground text-xs">{label}</div>
        <div
          className={cn(
            "text-2xl font-semibold tabular-nums",
            tone === "good" && "text-emerald-700 dark:text-emerald-400",
            tone === "bad" && "text-red-700 dark:text-red-400",
            tone === "warn" && "text-amber-700 dark:text-amber-400",
          )}
        >
          {value.toLocaleString("en-IN")}
        </div>
      </CardContent>
    </Card>
  );
}
