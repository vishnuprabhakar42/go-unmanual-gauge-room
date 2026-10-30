"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contractStatusAction, saveRatesAction } from "../../actions";

type Row = { instrumentTypeId: string; rate: string; gstPercent: string; onsiteRate: string; tatDays: string };
const NUMERIC: (keyof Row)[] = ["rate", "gstPercent", "onsiteRate", "tatDays"];

export function RatesGrid({
  contractId,
  types,
  initial,
  readOnly,
}: {
  contractId: string;
  types: { id: string; name: string }[];
  initial: Row[];
  readOnly: boolean;
}) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : []);
  const [pending, start] = useTransition();
  const used = new Set(rows.map((r) => r.instrumentTypeId));

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** Paste a column copied from Excel: fills this and the following rows. */
  const onPaste = (i: number, key: keyof Row) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const lines = e.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "");
    if (lines.length < 2) return;
    e.preventDefault();
    setRows((rs) =>
      rs.map((r, j) =>
        j >= i && j - i < lines.length ? { ...r, [key]: lines[j - i].split("\t")[0].replace(/[₹,\s]/g, "") } : r,
      ),
    );
  };

  const save = () =>
    start(async () => {
      const res = await saveRatesAction({ id: contractId, items: rows.filter((r) => r.instrumentTypeId) });
      if (res.ok) toast.success(tc("saved"));
      else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{t("rates")}</CardTitle>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((rs) => [...rs, { instrumentTypeId: "", rate: "", gstPercent: "18", onsiteRate: "", tatDays: "7" }])
            }
          >
            <Plus className="size-4" />
            {t("addRate")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="rates-grid">
            <TableHeader>
              <TableRow>
                <TableHead>{t("type")}</TableHead>
                <TableHead>{t("rate")}</TableHead>
                <TableHead>{t("gst")}</TableHead>
                <TableHead>{t("onsite")}</TableHead>
                <TableHead>{t("tat")}</TableHead>
                {!readOnly && <TableHead className="sr-only">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="min-w-56">
                    <Select
                      value={r.instrumentTypeId || undefined}
                      onValueChange={(v) => set(i, { instrumentTypeId: v })}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-9 w-full" aria-label={t("type")}>
                        <SelectValue placeholder={t("chooseType")} />
                      </SelectTrigger>
                      <SelectContent>
                        {types
                          .filter((x) => x.id === r.instrumentTypeId || !used.has(x.id))
                          .map((x) => (
                            <SelectItem key={x.id} value={x.id}>
                              {x.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {NUMERIC.map((k) => (
                    <TableCell key={k}>
                      <Input
                        aria-label={`${t(k === "rate" ? "rate" : k === "gstPercent" ? "gst" : k === "onsiteRate" ? "onsite" : "tat")} ${i + 1}`}
                        inputMode="decimal"
                        className="h-9 w-24 tabular-nums"
                        value={r[k]}
                        disabled={readOnly}
                        onChange={(e) => set(i, { [k]: e.target.value })}
                        onPaste={onPaste(i, k)}
                      />
                    </TableCell>
                  ))}
                  {!readOnly && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove"
                        onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!readOnly && (
          <Button onClick={save} disabled={pending} className="h-10">
            {t("saveRates")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ContractStatusButtons({ id, status }: { id: string; status: "DRAFT" | "ACTIVE" | "EXPIRED" }) {
  const t = useTranslations("contracts");
  const [pending, start] = useTransition();
  const go = (to: "ACTIVE" | "EXPIRED") =>
    start(async () => {
      const res = await contractStatusAction({ id, to });
      if (!res.ok) toast.error(res.error);
      else toast.success(to === "ACTIVE" ? t("activated") : t("expire"));
    });
  if (status === "DRAFT")
    return (
      <Button className="h-10" disabled={pending} onClick={() => go("ACTIVE")}>
        {t("activate")}
      </Button>
    );
  if (status === "ACTIVE")
    return (
      <Button
        variant="outline"
        className="h-10"
        disabled={pending}
        onClick={() => window.confirm(`${t("expire")}?`) && go("EXPIRED")}
      >
        {t("expire")}
      </Button>
    );
  return null;
}
