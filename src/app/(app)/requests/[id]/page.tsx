import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PO_TONE, RFQ_TONE, StatusPill } from "@/components/data/status-pill";
import { DueText, StatusBadge } from "@/components/instruments/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isEditable } from "@/domain/calibration-request-status";
import { daysUntilDue, dueStateFromPlanning } from "@/domain/due";
import { formatDate, formatDateTime, formatINR } from "@/domain/india/format";
import { isContractRateUsable } from "@/domain/vendor-selection";
import { requireAnyPermission } from "@/server/context";
import { contractRatesByType } from "@/server/services/rate-contracts";
import { tenantDb } from "@/server/tenant";
import { RequestStatusBadge } from "../status-badge";
import { RemoveItemButton, RequestNotes, RequestWorkflow, SourcingSelect } from "./request-client";

export const metadata: Metadata = { title: "Calibration request" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAnyPermission("calibration.request", "po.manage");
  const t = await getTranslations();
  const db = tenantDb(ctx.tenant);
  const req = await db.calibrationRequest.findUnique({
    where: { id },
    include: {
      plant: { select: { code: true, name: true } },
      items: {
        where: { removedAt: null },
        orderBy: { dueAt: { sort: "asc", nulls: "last" } },
        include: {
          proposedVendor: { select: { name: true } },
          rateContractItem: { select: { rate: true, tatDays: true } },
          instrument: {
            select: {
              id: true,
              code: true,
              status: true,
              nextDueAt: true,
              planningDate: true,
              description: true,
              nablRequired: true,
              typeId: true,
              type: { select: { name: true, defaultLeadTimeDays: true } },
              department: { select: { name: true } },
            },
          },
        },
      },
      purchaseOrders: { select: { id: true, number: true, status: true, total: true, vendor: { select: { name: true } } } },
      rfqs: { select: { id: true, number: true, status: true } },
    },
  });
  if (!req) notFound();
  const [requester, rates] = await Promise.all([
    db.user.findUnique({ where: { id: req.requestedById }, select: { name: true, email: true } }),
    contractRatesByType(db, ctx.org.id, [...new Set(req.items.map((i) => i.instrument.typeId))]),
  ]);
  const plannerCan = ctx.can("calibration.request", req.plantId);
  const editable = isEditable(req.status) && plannerCan;
  const sourcingEditable = (req.status === "DRAFT" || req.status === "SUBMITTED") && plannerCan;
  const now = new Date();
  const counts = {
    contract: req.items.filter((i) => i.sourcing === "CONTRACT").length,
    rfq: req.items.filter((i) => i.sourcing !== "CONTRACT").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-muted-foreground text-sm">
            <Link href="/requests" className="hover:underline">
              {t("requests.title")}
            </Link>
          </div>
          <h1 className="font-mono text-2xl font-semibold">{req.number}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <RequestStatusBadge status={req.status} />
            <span className="text-muted-foreground">
              {req.plant.code} · {req.plant.name} · {requester?.name ?? requester?.email} · {formatDateTime(req.createdAt)}
            </span>
          </div>
          <div className="text-muted-foreground text-sm" data-testid="sourcing-summary">
            {t("contracts.title")}: {counts.contract} · RFQ: {counts.rfq}
          </div>
        </div>
        <RequestWorkflow
          id={req.id}
          number={req.number}
          status={req.status}
          can={{
            edit: plannerCan,
            approve: ctx.can("calibration.approve", req.plantId),
            release: ctx.can("po.manage", req.plantId),
          }}
        />
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">{t("requests.nextSteps")}</p>
          <RequestNotes id={req.id} notes={req.notes ?? ""} editable={editable} />
        </CardContent>
      </Card>

      {(req.purchaseOrders.length > 0 || req.rfqs.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("requests.linked")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2" data-testid="linked-docs">
            {req.purchaseOrders.map((p) => (
              <Link
                key={p.id}
                href={`/purchase/orders/${p.id}`}
                className="hover:bg-muted flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-mono font-medium">{p.number}</span>
                <span className="text-muted-foreground">{p.vendor.name}</span>
                <span className="tabular-nums">{formatINR(p.total.toNumber())}</span>
                <StatusPill label={t(`poStatus.${p.status}`)} tone={PO_TONE[p.status]} />
              </Link>
            ))}
            {req.rfqs.map((r) => (
              <Link
                key={r.id}
                href={`/purchase/rfqs/${r.id}`}
                className="hover:bg-muted flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-mono font-medium">{r.number}</span>
                <StatusPill label={t(`rfqStatus.${r.status}`)} tone={RFQ_TONE[r.status]} />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="request-items">
          <TableHeader>
            <TableRow>
              <TableHead>{t("instruments.code")}</TableHead>
              <TableHead>{t("instruments.type")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("instruments.status")}</TableHead>
              <TableHead>{t("requests.due")}</TableHead>
              <TableHead className="min-w-56">{t("requests.vendor")}</TableHead>
              {editable && <TableHead className="sr-only">{t("common.actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {req.items.map((item) => {
              const i = item.instrument;
              const state = dueStateFromPlanning(i.nextDueAt, i.planningDate);
              const options = (rates.get(i.typeId) ?? [])
                .filter((r) => isContractRateUsable(r, req.plantId, i.nablRequired, now) === null)
                .sort((a, b) => a.rate - b.rate || a.tatDays - b.tatDays)
                .map((r) => ({ value: r.rateContractItemId, label: `${r.vendorName} · ${formatINR(r.rate)} · ${r.tatDays} d` }));
              const current = item.sourcing === "CONTRACT" && item.rateContractItemId ? item.rateContractItemId : "RFQ";
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link href={`/instruments/${i.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                      {i.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{i.type.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {[i.description, i.department?.name].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <StatusBadge status={i.status} />
                  </TableCell>
                  <TableCell>
                    <DueText state={state} date={formatDate(i.nextDueAt)} days={i.nextDueAt ? daysUntilDue(i.nextDueAt) : null} />
                  </TableCell>
                  <TableCell>
                    {sourcingEditable ? (
                      <SourcingSelect requestId={req.id} itemId={item.id} value={current} options={options} code={i.code} />
                    ) : (
                      <span className="text-sm">
                        {item.sourcing === "CONTRACT"
                          ? `${item.proposedVendor?.name ?? "—"} · ${item.rateContractItem ? formatINR(item.rateContractItem.rate.toNumber()) : ""}`
                          : item.proposedVendor?.name
                            ? `${item.proposedVendor.name} (RFQ)`
                            : t("requests.sourcingRfq")}
                      </span>
                    )}
                    {item.scopeWarning && (
                      <div className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        {item.scopeWarning}
                      </div>
                    )}
                  </TableCell>
                  {editable && (
                    <TableCell className="text-right">
                      <RemoveItemButton itemId={item.id} requestId={req.id} code={i.code} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
