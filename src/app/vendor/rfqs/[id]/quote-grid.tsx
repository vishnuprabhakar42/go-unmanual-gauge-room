"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parsePastedGrid } from "@/domain/paste";
import { submitQuoteAction } from "../../actions";

type Item = {
  id: string;
  code: string;
  details: string;
  rate: string;
  gstPercent: string;
  tatDays: string;
  nablInScope: boolean;
};
const COLS = ["rate", "gstPercent", "tatDays"] as const;

/** Paste rows from Excel (Rate, GST %, TAT columns) into any cell: fills that row and the ones below. */
export function QuoteGrid({
  rfqId,
  items: initial,
  open,
  hasQuote,
  validUntil: vu,
  remarks: rm,
}: {
  rfqId: string;
  items: Item[];
  open: boolean;
  hasQuote: boolean;
  validUntil: string;
  remarks: string;
}) {
  const t = useTranslations("portal");
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [validUntil, setValidUntil] = useState(vu);
  const [remarks, setRemarks] = useState(rm);
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const onPaste = (row: number, col: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const grid = parsePastedGrid(e.clipboardData.getData("text"));
    if (grid.length < 2 && grid[0]?.length < 2) return; // single value: normal paste
    e.preventDefault();
    setItems((xs) =>
      xs.map((x, j) => {
        const cells = grid[j - row];
        if (!cells) return x;
        const next = { ...x };
        cells.forEach((v, k) => {
          const key = COLS[col + k];
          if (key && v !== "") next[key] = v;
        });
        return next;
      }),
    );
  };

  const submit = () =>
    start(async () => {
      const res = await submitQuoteAction({
        rfqId,
        validUntil,
        remarks,
        lines: items
          .filter((i) => i.rate.trim())
          .map((i) => ({
            requestItemId: i.id,
            rate: i.rate,
            gstPercent: i.gstPercent,
            tatDays: i.tatDays,
            nablInScope: i.nablInScope,
          })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("quoteSaved"));
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {!open && (
        <Alert>
          <AlertDescription>{t("closed")}</AlertDescription>
        </Alert>
      )}
      {open && <p className="text-muted-foreground text-xs">{t("pasteHint")}</p>}
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="quote-grid">
          <TableHeader>
            <TableRow>
              <TableHead>{t("instrument")}</TableHead>
              <TableHead>{t("rate")}</TableHead>
              <TableHead>{t("gst")}</TableHead>
              <TableHead>{t("tat")}</TableHead>
              <TableHead>{t("inScope")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i, row) => (
              <TableRow key={i.id}>
                <TableCell>
                  <div className="font-mono font-medium">{i.code}</div>
                  <div className="text-muted-foreground text-xs">{i.details}</div>
                </TableCell>
                {COLS.map((k, col) => (
                  <TableCell key={k}>
                    <Input
                      aria-label={`${t(k === "rate" ? "rate" : k === "gstPercent" ? "gst" : "tat")} ${i.code}`}
                      inputMode="decimal"
                      className={k === "rate" ? "h-10 w-28" : "h-10 w-20"}
                      value={i[k]}
                      disabled={!open}
                      onChange={(e) => set(row, { [k]: e.target.value })}
                      onPaste={onPaste(row, col)}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <Checkbox
                    aria-label={`${t("inScope")} ${i.code}`}
                    checked={i.nablInScope}
                    disabled={!open}
                    onCheckedChange={(v) => set(row, { nablInScope: v === true })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("validUntil")} htmlFor="valid" optional>
          <Input
            id="valid"
            type="date"
            className="h-11"
            value={validUntil}
            disabled={!open}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
        <Field label={t("remarks")} htmlFor="remarks" optional>
          <Input id="remarks" className="h-11" value={remarks} disabled={!open} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
      {open && (
        <Button className="h-11" onClick={submit} disabled={pending} data-testid="submit-quote">
          {hasQuote ? t("updateQuote") : t("submitQuote")}
        </Button>
      )}
    </div>
  );
}
