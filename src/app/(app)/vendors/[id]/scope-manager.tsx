"use client";

import { Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addScopeRowAction, importScopeCsvAction, removeScopeRowAction } from "../actions";

type Row = {
  id: string;
  discipline: string;
  parameter: string;
  rangeMin: number | null;
  rangeMax: number | null;
  unit: string | null;
  cmc: string | null;
};
const EMPTY = { discipline: "", parameter: "", rangeMin: "", rangeMax: "", unit: "", cmc: "" };

export function ScopeManager({ vendorId, rows, editable }: { vendorId: string; rows: Row[]; editable: boolean }) {
  const t = useTranslations("vendors");
  const [draft, setDraft] = useState(EMPTY);
  const [replace, setReplace] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const add = () =>
    start(async () => {
      const res = await addScopeRowAction({ vendorId, row: draft });
      if (!res.ok) return void toast.error(res.error);
      setDraft(EMPTY);
    });

  const importCsv = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      const res = await importScopeCsvAction({ vendorId, csv: await file.text(), replace });
      if (fileRef.current) fileRef.current.value = "";
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("imported", { count: res.data.imported }));
      if (res.data.errors.length)
        toast.warning(
          t("csvErrors", {
            count: res.data.errors.length,
            details: res.data.errors
              .slice(0, 3)
              .map((e) => `line ${e.line}`)
              .join(", "),
          }),
        );
    });
  };

  const fields = [
    ["discipline", t("discipline"), "w-28"],
    ["parameter", t("parameter"), "w-36"],
    ["rangeMin", t("rangeMin"), "w-20"],
    ["rangeMax", t("rangeMax"), "w-20"],
    ["unit", t("unit"), "w-16"],
    ["cmc", t("cmc"), "w-32"],
  ] as const;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{t("scope")}</CardTitle>
        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id="replace-scope" checked={replace} onCheckedChange={(v) => setReplace(v === true)} />
              <Label htmlFor="replace-scope" className="text-sm font-normal">
                {t("replaceScope")}
              </Label>
            </div>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
              {t("importCsv")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => importCsv(e.target.files?.[0])}
              data-testid="scope-csv"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {editable && <p className="text-muted-foreground text-xs">{t("csvHint")}</p>}
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="scope-table">
            <TableHeader>
              <TableRow>
                {fields.map(([k, label]) => (
                  <TableHead key={k}>{label}</TableHead>
                ))}
                {editable && <TableHead className="sr-only">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    {t("scopeEmpty")}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.discipline}</TableCell>
                  <TableCell>{r.parameter}</TableCell>
                  <TableCell className="tabular-nums">{r.rangeMin ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{r.rangeMax ?? "—"}</TableCell>
                  <TableCell>{r.unit ?? "—"}</TableCell>
                  <TableCell>{r.cmc ?? "—"}</TableCell>
                  {editable && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove"
                        disabled={pending}
                        onClick={() => start(async () => void (await removeScopeRowAction({ vendorId, scopeId: r.id })))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {editable && (
                <TableRow>
                  {fields.map(([k, label, w]) => (
                    <TableCell key={k}>
                      <Input
                        aria-label={label}
                        className={`h-9 ${w}`}
                        value={draft[k]}
                        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button size="sm" onClick={add} disabled={pending || !draft.discipline || !draft.parameter}>
                      {t("addScope")}
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
