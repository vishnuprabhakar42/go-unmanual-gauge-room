import { FileText, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PO_TONE, StatusPill } from "@/components/data/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { amountInWordsINR, computeTotals } from "@/domain/gst";
import { formatDate, formatDateTime, formatINR } from "@/domain/india/format";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { PoActions } from "./po-actions";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("po.manage");
  const t = await getTranslations();
  const db = tenantDb(ctx.tenant);
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      plant: true,
      request: { select: { id: true, number: true } },
      items: { orderBy: { createdAt: "asc" }, include: { instrument: { select: { id: true, code: true } } } },
    },
  });
  if (!po) notFound();
  const rfq = po.rfqId ? await db.rfq.findUnique({ where: { id: po.rfqId }, select: { id: true, number: true } }) : null;
  const totals = computeTotals(
    po.items.map((i) => ({ rate: i.rate.toNumber(), gstPercent: i.gstPercent.toNumber() })),
    po.interState,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-muted-foreground text-sm">
            <Link href="/purchase/orders" className="hover:underline">
              {t("pos.title")}
            </Link>
          </div>
          <h1 className="font-mono text-2xl font-semibold">{po.number}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill label={t(`poStatus.${po.status}`)} tone={PO_TONE[po.status]} />
            <span className="text-muted-foreground">
              {po.vendor.name} · {po.plant.code} · {t(`poSource.${po.source}`)} · {formatDateTime(po.createdAt)}
              {po.sentAt && ` · sent ${formatDate(po.sentAt)}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {po.request && (
              <Link href={`/requests/${po.request.id}`} className="underline-offset-4 hover:underline">
                {t("pos.request")}: <span className="font-mono">{po.request.number}</span>
              </Link>
            )}
            {rfq && (
              <Link href={`/purchase/rfqs/${rfq.id}`} className="underline-offset-4 hover:underline">
                {t("pos.rfq")}: <span className="font-mono">{rfq.number}</span>
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10">
            <a href={`/api/purchase-orders/${po.id}/pdf`} target="_blank" rel="noreferrer" data-testid="po-pdf">
              <FileText className="size-4" />
              {t("pos.pdf")}
            </a>
          </Button>
          {["APPROVED", "SENT", "ACKNOWLEDGED"].includes(po.status) && ctx.can("dispatch.manage", po.plantId) && (
            <Button asChild variant="outline" className="h-10">
              <Link href={`/dispatch/challans/new?po=${po.id}`} data-testid="create-challan">
                <Truck className="size-4" />
                {t("dispatch.createChallan")}
              </Link>
            </Button>
          )}
          <PoActions id={po.id} status={po.status} canApprove={ctx.can("po.approve", po.plantId)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("pos.instrument")}</TableHead>
              <TableHead>{t("pos.description")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{t("pos.tat")}</TableHead>
              <TableHead className="text-right">{t("pos.rate")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{t("pos.gst")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link href={`/instruments/${i.instrument.id}`} className="font-mono underline-offset-4 hover:underline">
                    {i.instrument.code}
                  </Link>
                </TableCell>
                <TableCell>{i.description}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{i.tatDays}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(i.rate.toNumber())}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{i.gstPercent.toNumber()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card className="ml-auto max-w-sm">
        <CardContent className="space-y-1 text-sm" data-testid="po-totals">
          <Row label={t("pos.subtotal")} value={formatINR(totals.subtotal)} />
          {po.interState ? (
            <Row label={t("pos.igst")} value={formatINR(totals.igst)} />
          ) : (
            <>
              <Row label={t("pos.cgst")} value={formatINR(totals.cgst)} />
              <Row label={t("pos.sgst")} value={formatINR(totals.sgst)} />
            </>
          )}
          <div className="border-t pt-1">
            <Row label={t("pos.grandTotal")} value={formatINR(totals.total)} bold />
          </div>
          <p className="text-muted-foreground pt-1 text-xs">{amountInWordsINR(totals.total)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between tabular-nums ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
