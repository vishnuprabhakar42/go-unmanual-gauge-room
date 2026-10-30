"use client";

import { Check, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { QUOTE_TONE, StatusPill } from "@/components/data/status-pill";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatINR } from "@/domain/india/format";
import { compareOffers, type Offer } from "@/domain/quote-compare";
import { cn } from "@/lib/utils";
import { awardRfqAction, inviteVendorsAction, reviewQuoteAction, rfqStatusAction, saveQuoteAction } from "../../actions";

type Line = {
  quoteItemId: string;
  requestItemId: string;
  rate: number;
  gstPercent: number;
  tatDays: number;
  nablInScope: boolean;
  technicalRemarks: string;
  awarded: boolean;
};
type Quote = {
  id: string;
  status: Offer["techStatus"];
  techRemarks: string | null;
  remarks: string;
  validUntil: string;
  lines: Line[];
};
type Vendor = { id: string; name: string; quote: Quote | null };
type Item = { id: string; code: string; description: string };

export function RfqWorkbench({
  rfqId,
  status,
  canManage,
  canReview,
  items,
  vendors,
  candidates,
}: {
  rfqId: string;
  status: "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";
  canManage: boolean;
  canReview: boolean;
  items: Item[];
  vendors: Vendor[];
  candidates: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [quoteFor, setQuoteFor] = useState<Vendor | null>(null);
  const [rejecting, setRejecting] = useState<Quote | null>(null);
  const [reason, setReason] = useState("");
  const [invite, setInvite] = useState("");
  const editable = status === "OPEN" || status === "CLOSED";

  // Per item: compared offers across vendors
  const comparison = useMemo(
    () =>
      new Map(
        items.map((item) => {
          const offers: Offer[] = vendors.flatMap((v) => {
            const l = v.quote?.lines.find((x) => x.requestItemId === item.id);
            return l && v.quote
              ? [
                  {
                    quoteId: v.quote.id,
                    quoteItemId: l.quoteItemId,
                    vendorId: v.id,
                    vendorName: v.name,
                    rate: l.rate,
                    gstPercent: l.gstPercent,
                    tatDays: l.tatDays,
                    nablInScope: l.nablInScope,
                    techStatus: v.quote.status,
                    awarded: l.awarded,
                  },
                ]
              : [];
          });
          return [item.id, compareOffers(offers)];
        }),
      ),
    [items, vendors],
  );
  const [awards, setAwards] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.flatMap((i) =>
        comparison.get(i.id)?.find((o) => o.recommended)
          ? [[i.id, comparison.get(i.id)!.find((o) => o.recommended)!.quoteItemId]]
          : [],
      ),
    ),
  );

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      if (success) toast.success(success);
      router.refresh();
    });

  const award = () =>
    start(async () => {
      const res = await awardRfqAction({ rfqId, awards });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("rfqs.awarded", { count: res.data.length, numbers: res.data.map((p) => p.number).join(", ") }));
      router.push(res.data.length === 1 ? `/purchase/orders/${res.data[0].id}` : "/purchase/orders");
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("rfqs.vendors")}</CardTitle>
          {canManage && editable && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={invite || undefined} onValueChange={setInvite}>
                <SelectTrigger className="h-9 w-56" aria-label={t("rfqs.invite")}>
                  <SelectValue placeholder={candidates.length ? t("rfqs.invite") : t("rfqs.inviteNone")} />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!invite || pending}
                onClick={() => run(() => inviteVendorsAction({ rfqId, vendorIds: [invite] }))}
              >
                <UserPlus className="size-4" />
                {t("rfqs.invite")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => rfqStatusAction({ rfqId, to: status === "OPEN" ? "CLOSED" : "OPEN" }))}
              >
                {status === "OPEN" ? t("rfqs.close") : t("rfqs.reopen")}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <ul className="divide-y" data-testid="rfq-vendors">
            {vendors.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="font-medium">{v.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {v.quote ? (
                      <StatusPill label={t(`quoteStatus.${v.quote.status}`)} tone={QUOTE_TONE[v.quote.status]} />
                    ) : (
                      <span className="text-muted-foreground">{t("rfqs.noQuotes")}</span>
                    )}
                    {v.quote?.techRemarks && <span className="text-muted-foreground">{v.quote.techRemarks}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManage && editable && (
                    <Button size="sm" variant="outline" onClick={() => setQuoteFor(v)} data-testid={`enter-quote-${v.name}`}>
                      {v.quote ? t("rfqs.editQuote") : t("rfqs.enterQuote")}
                    </Button>
                  )}
                  {canReview && editable && v.quote && v.quote.status === "SUBMITTED" && (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(() => reviewQuoteAction({ rfqId, quoteId: v.quote!.id, approved: true }), t("rfqs.techOk"))
                        }
                      >
                        <Check className="size-4" />
                        {t("rfqs.techOk")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => (setRejecting(v.quote), setReason(""))}
                      >
                        <X className="size-4" />
                        {t("rfqs.techNotOk")}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rfqs.comparison")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="comparison">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pos.instrument")}</TableHead>
                  {vendors.map((v) => (
                    <TableHead key={v.id} className="min-w-40">
                      {v.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const offers = comparison.get(item.id) ?? [];
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="align-top">
                        <div className="font-mono font-medium">{item.code}</div>
                        <div className="text-muted-foreground text-xs">{item.description}</div>
                      </TableCell>
                      {vendors.map((v) => {
                        const o = offers.find((x) => x.vendorId === v.id);
                        if (!o)
                          return (
                            <TableCell key={v.id} className="text-muted-foreground align-top">
                              —
                            </TableCell>
                          );
                        const chosen = awards[item.id] === o.quoteItemId;
                        return (
                          <TableCell
                            key={v.id}
                            className={cn("align-top", o.recommended && "bg-emerald-50 dark:bg-emerald-950/40")}
                          >
                            <label
                              className={cn(
                                "flex items-start gap-2",
                                (!canManage || !o.eligible || !editable) && "cursor-default",
                              )}
                            >
                              {canManage && editable && (
                                <input
                                  type="radio"
                                  name={`award-${item.id}`}
                                  className="mt-1 size-4"
                                  disabled={!o.eligible}
                                  checked={chosen}
                                  onChange={() => setAwards((a) => ({ ...a, [item.id]: o.quoteItemId }))}
                                  aria-label={`${t("rfqs.award")} ${item.code} → ${v.name}`}
                                />
                              )}
                              <span className="text-sm">
                                <span className="font-medium tabular-nums">{formatINR(o.rate)}</span>
                                <span className="text-muted-foreground block text-xs tabular-nums">
                                  {t("rfqs.landed")} {formatINR(o.landed)} · {o.tatDays} d
                                </span>
                                {!o.nablInScope && <span className="text-destructive block text-xs">✕ {t("rfqs.inScope")}</span>}
                                {o.recommended && (
                                  <span className="block text-xs text-emerald-700 dark:text-emerald-400">
                                    ✓ {t("rfqs.recommended")}
                                  </span>
                                )}
                                {o.awarded && <span className="block text-xs font-medium">★ {t("quoteStatus.AWARDED")}</span>}
                              </span>
                            </label>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {canManage && editable && (
            <Button
              className="mt-4 h-11"
              onClick={award}
              disabled={pending || Object.keys(awards).length < items.length}
              data-testid="award"
            >
              {t("rfqs.awardAll")}
            </Button>
          )}
        </CardContent>
      </Card>

      {quoteFor && (
        <QuoteDialog
          rfqId={rfqId}
          vendor={quoteFor}
          items={items}
          onClose={() => setQuoteFor(null)}
          onSaved={() => router.refresh()}
        />
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rfqs.techNotOk")}</DialogTitle>
          </DialogHeader>
          <Field label={t("rfqs.techReason")} htmlFor="tech-reason">
            <Textarea id="tech-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!reason.trim() || pending}
              onClick={() => {
                const q = rejecting!;
                setRejecting(null);
                run(() => reviewQuoteAction({ rfqId, quoteId: q.id, approved: false, remarks: reason }), t("rfqs.techNotOk"));
              }}
            >
              {t("rfqs.techNotOk")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Draft = { rate: string; gstPercent: string; tatDays: string; nablInScope: boolean; technicalRemarks: string };

function QuoteDialog({
  rfqId,
  vendor,
  items,
  onClose,
  onSaved,
}: {
  rfqId: string;
  vendor: Vendor;
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [validUntil, setValidUntil] = useState(vendor.quote?.validUntil ?? "");
  const [remarks, setRemarks] = useState(vendor.quote?.remarks ?? "");
  const [lines, setLines] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      items.map((i) => {
        const l = vendor.quote?.lines.find((x) => x.requestItemId === i.id);
        return [
          i.id,
          l
            ? {
                rate: String(l.rate),
                gstPercent: String(l.gstPercent),
                tatDays: String(l.tatDays),
                nablInScope: l.nablInScope,
                technicalRemarks: l.technicalRemarks,
              }
            : { rate: "", gstPercent: "18", tatDays: "7", nablInScope: true, technicalRemarks: "" },
        ];
      }),
    ),
  );
  const set = (id: string, patch: Partial<Draft>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));
  const onPasteRates = (startIdx: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const values = e.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .filter((x) => x.trim());
    if (values.length < 2) return;
    e.preventDefault();
    setLines((ls) => {
      const next = { ...ls };
      values.forEach((v, k) => {
        const item = items[startIdx + k];
        if (item) next[item.id] = { ...next[item.id], rate: v.split("\t")[0].replace(/[₹,\s]/g, "") };
      });
      return next;
    });
  };

  const save = () =>
    start(async () => {
      const res = await saveQuoteAction({
        rfqId,
        vendorId: vendor.id,
        validUntil,
        remarks,
        lines: items.filter((i) => lines[i.id].rate.trim()).map((i) => ({ requestItemId: i.id, ...lines[i.id] })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("rfqs.quoteSaved"));
      onSaved();
      onClose();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("rfqs.quoteFor", { vendor: vendor.name })}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">{t("rfqs.pasteHint")}</p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pos.instrument")}</TableHead>
                <TableHead>{t("pos.rate")}</TableHead>
                <TableHead>{t("pos.gst")}</TableHead>
                <TableHead>{t("pos.tat")}</TableHead>
                <TableHead>{t("rfqs.inScope")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i, idx) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-sm">{i.code}</TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("pos.rate")} ${i.code}`}
                      inputMode="decimal"
                      className="h-9 w-24"
                      value={lines[i.id].rate}
                      onChange={(e) => set(i.id, { rate: e.target.value })}
                      onPaste={onPasteRates(idx)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("pos.gst")} ${i.code}`}
                      inputMode="decimal"
                      className="h-9 w-16"
                      value={lines[i.id].gstPercent}
                      onChange={(e) => set(i.id, { gstPercent: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${t("pos.tat")} ${i.code}`}
                      inputMode="numeric"
                      className="h-9 w-16"
                      value={lines[i.id].tatDays}
                      onChange={(e) => set(i.id, { tatDays: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      aria-label={`${t("rfqs.inScope")} ${i.code}`}
                      checked={lines[i.id].nablInScope}
                      onCheckedChange={(v) => set(i.id, { nablInScope: v === true })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("rfqs.validUntil")} htmlFor="q-valid" optional>
            <Input id="q-valid" type="date" className="h-10" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
          <Field label={t("rfqs.remarks")} htmlFor="q-remarks" optional>
            <Input id="q-remarks" className="h-10" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending} data-testid="save-quote">
            {t("rfqs.saveQuote")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
