import { Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { ChallanStatus } from "./challan-status";

export const metadata: Metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  const ctx = await requireAnyPermission("dispatch.manage", "receipt.manage");
  const t = await getTranslations();
  const db = tenantDb(ctx.tenant);
  const plant = ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {};
  const [pos, waiting] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { ...plant, status: { in: ["APPROVED", "SENT", "ACKNOWLEDGED"] } },
      orderBy: { approvedAt: "asc" },
      include: {
        vendor: { select: { name: true } },
        items: {
          select: {
            instrument: {
              select: {
                status: true,
                challanItems: {
                  where: { returnedAt: null, challan: { status: { in: ["DRAFT", "ISSUED", "PARTIALLY_RETURNED"] } } },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    }),
    db.deliveryChallan.findMany({
      where: { ...plant, status: { in: ["DRAFT", "ISSUED"] }, dispatchedAt: null },
      orderBy: { createdAt: "asc" },
      include: { vendor: { select: { name: true } }, _count: { select: { items: true } } },
    }),
  ]);
  const ready = pos
    .map((p) => ({
      ...p,
      readyCount: p.items.filter(
        (i) => ["IN_STORE", "IN_USE"].includes(i.instrument.status) && i.instrument.challanItems.length === 0,
      ).length,
    }))
    .filter((p) => p.readyCount > 0);
  const canDispatch = ctx.can("dispatch.manage");

  return (
    <>
      <PageHeader title={t("dispatch.title")} subtitle={t("dispatch.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dispatch.readyPos")}</CardTitle>
          </CardHeader>
          <CardContent>
            {ready.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("dispatch.noReadyPos")}</p>
            ) : (
              <ul className="divide-y" data-testid="ready-pos">
                {ready.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <Link
                        href={`/purchase/orders/${p.id}`}
                        className="font-mono font-medium underline-offset-4 hover:underline"
                      >
                        {p.number}
                      </Link>
                      <div className="text-muted-foreground text-sm">
                        {p.vendor.name} · {t("dispatch.instrumentsReady", { count: p.readyCount })}
                      </div>
                    </div>
                    {canDispatch && (
                      <Button asChild size="sm">
                        <Link href={`/dispatch/challans/new?po=${p.id}`}>
                          <Truck className="size-4" />
                          {t("dispatch.createChallan")}
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dispatch.awaitingDispatch")}</CardTitle>
          </CardHeader>
          <CardContent>
            {waiting.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("dispatch.noAwaiting")}</p>
            ) : (
              <ul className="divide-y">
                {waiting.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <Link
                        href={`/dispatch/challans/${c.id}`}
                        className="font-mono font-medium underline-offset-4 hover:underline"
                      >
                        {c.number ?? t("dispatch.draftNumber")}
                      </Link>
                      <div className="text-muted-foreground text-sm">
                        {c.vendor.name} · {t("dashboard.instrumentsCount", { count: c._count.items })} ·{" "}
                        {formatDate(c.date ?? c.createdAt)}
                      </div>
                    </div>
                    <ChallanStatus status={c.status} dispatched={false} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
