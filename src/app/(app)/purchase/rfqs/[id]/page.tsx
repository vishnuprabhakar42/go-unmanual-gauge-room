import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RFQ_TONE, StatusPill } from "@/components/data/status-pill";
import { formatDate, toDateInput } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { describeInstrument } from "@/server/services/calibration-requests";
import { tenantDb } from "@/server/tenant";
import { RfqWorkbench } from "./rfq-workbench";

export const metadata: Metadata = { title: "RFQ" };

export default async function RfqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAnyPermission("rfq.manage", "quote.techApprove");
  const t = await getTranslations();
  const db = tenantDb(ctx.tenant);
  const rfq = await db.rfq.findUnique({
    where: { id },
    include: {
      request: { select: { id: true, number: true } },
      vendors: { include: { vendor: { select: { id: true, name: true } } }, orderBy: { invitedAt: "asc" } },
      quotes: { include: { items: true } },
    },
  });
  if (!rfq) notFound();
  const [items, approved, pos] = await Promise.all([
    db.calibrationRequestItem.findMany({
      where: { requestId: rfq.requestId, removedAt: null, sourcing: "RFQ" },
      include: {
        instrument: {
          select: { code: true, description: true, rangeMin: true, rangeMax: true, unit: true, type: { select: { name: true } } },
        },
      },
      orderBy: { dueAt: { sort: "asc", nulls: "last" } },
    }),
    db.vendorLink.findMany({
      where: { isApproved: true, archivedAt: null },
      include: { vendor: { select: { id: true, name: true } } },
    }),
    db.purchaseOrder.findMany({ where: { rfqId: id }, select: { id: true, number: true } }),
  ]);
  const invitedIds = new Set(rfq.vendors.map((v) => v.vendorId));
  const quoteBy = new Map(rfq.quotes.map((q) => [q.vendorId, q]));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-muted-foreground text-sm">
          <Link href="/purchase/rfqs" className="hover:underline">
            {t("rfqs.title")}
          </Link>
        </div>
        <h1 className="font-mono text-2xl font-semibold">{rfq.number}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill label={t(`rfqStatus.${rfq.status}`)} tone={RFQ_TONE[rfq.status]} />
          <span className="text-muted-foreground">
            {t("rfqs.due")}: {formatDate(rfq.dueAt)} ·{" "}
            <Link href={`/requests/${rfq.request.id}`} className="underline-offset-4 hover:underline">
              {rfq.request.number}
            </Link>
          </span>
          {pos.map((p) => (
            <Link key={p.id} href={`/purchase/orders/${p.id}`} className="font-mono underline-offset-4 hover:underline">
              {p.number}
            </Link>
          ))}
        </div>
      </div>
      <RfqWorkbench
        rfqId={rfq.id}
        status={rfq.status}
        canManage={ctx.can("rfq.manage")}
        canReview={ctx.can("quote.techApprove", rfq.plantId)}
        items={items.map((i) => ({ id: i.id, code: i.instrument.code, description: describeInstrument(i.instrument) }))}
        candidates={approved.filter((a) => !invitedIds.has(a.vendorId)).map((a) => ({ id: a.vendor.id, name: a.vendor.name }))}
        vendors={rfq.vendors.map((v) => {
          const q = quoteBy.get(v.vendorId);
          return {
            id: v.vendor.id,
            name: v.vendor.name,
            quote: q
              ? {
                  id: q.id,
                  status: q.status,
                  techRemarks: q.techRemarks,
                  remarks: q.remarks ?? "",
                  validUntil: toDateInput(q.validUntil),
                  lines: q.items.map((l) => ({
                    quoteItemId: l.id,
                    requestItemId: l.requestItemId,
                    rate: l.rate.toNumber(),
                    gstPercent: l.gstPercent.toNumber(),
                    tatDays: l.tatDays,
                    nablInScope: l.nablInScope,
                    technicalRemarks: l.technicalRemarks ?? "",
                    awarded: l.awarded,
                  })),
                }
              : null,
          };
        })}
      />
    </div>
  );
}
