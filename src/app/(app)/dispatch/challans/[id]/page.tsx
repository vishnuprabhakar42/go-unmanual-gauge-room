import { FileText, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/instruments/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { totalValue } from "@/domain/challan";
import { formatDate, formatDateTime, formatINR } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { ChallanStatus } from "../../challan-status";
import { ChallanActions, ReceiveTable } from "./challan-client";

export const metadata: Metadata = { title: "Delivery challan" };

export default async function ChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAnyPermission("dispatch.manage", "receipt.manage");
  const t = await getTranslations();
  const c = await tenantDb(ctx.tenant).deliveryChallan.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      po: { select: { id: true, number: true } },
      items: { orderBy: { createdAt: "asc" }, include: { instrument: { select: { id: true, code: true, status: true } } } },
    },
  });
  if (!c) notFound();
  const transport = [
    c.transportMode && t(`transport.${c.transportMode}`),
    c.vehicleNo,
    c.courierName,
    c.awbNo && `AWB ${c.awbNo}`,
    c.ewayBillNo && `EWB ${c.ewayBillNo}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-muted-foreground text-sm">
            <Link href="/dispatch/challans" className="hover:underline">
              {t("dispatch.challans")}
            </Link>
          </div>
          <h1 className="font-mono text-2xl font-semibold">{c.number ?? t("dispatch.draftNumber")}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ChallanStatus status={c.status} dispatched={!!c.dispatchedAt} />
            <span className="text-muted-foreground">
              {c.vendor.name} ·{" "}
              <Link href={`/purchase/orders/${c.po.id}`} className="font-mono underline-offset-4 hover:underline">
                {c.po.number}
              </Link>
              {c.date && ` · ${formatDate(c.date)}`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10">
            <a href={`/api/challans/${c.id}/pdf`} target="_blank" rel="noreferrer" data-testid="challan-pdf">
              <FileText className="size-4" />
              {t("dispatch.challanPdf")}
            </a>
          </Button>
          {c.gatePassNo && (
            <Button asChild variant="outline" className="h-10">
              <a href={`/api/challans/${c.id}/gate-pass`} target="_blank" rel="noreferrer" data-testid="gate-pass-pdf">
                <Ticket className="size-4" />
                {t("dispatch.gatePass")}
              </a>
            </Button>
          )}
          {ctx.can("dispatch.manage", c.plantId) && (
            <ChallanActions id={c.id} number={c.number ?? ""} status={c.status} dispatched={!!c.dispatchedAt} />
          )}
        </div>
      </div>

      {c.dispatchedAt && (
        <Card>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground text-xs">{t("dispatch.dispatchedAt")}</div>
              {formatDateTime(c.dispatchedAt)}
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("dispatch.gatePass")}</div>
              <span className="font-mono">{c.gatePassNo}</span>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("dispatch.transportMode")}</div>
              {transport || "—"}
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("dispatch.expectedReturn")}</div>
              {formatDate(c.expectedReturnAt)}
            </div>
          </CardContent>
        </Card>
      )}

      <ReceiveTable
        challanId={c.id}
        canReceive={!!c.dispatchedAt && ctx.can("receipt.manage", c.plantId)}
        items={c.items.map((i) => ({
          id: i.id,
          code: i.instrument.code,
          instrumentId: i.instrument.id,
          description: i.description,
          hsnCode: i.hsnCode,
          value: i.value.toNumber(),
          returnedAt: i.returnedAt ? formatDate(i.returnedAt) : null,
          remarks: i.receiptRemarks,
          status: <StatusBadge status={i.instrument.status} />,
        }))}
        total={formatINR(totalValue(c.items.map((i) => ({ value: i.value.toNumber() }))))}
      />
    </div>
  );
}
