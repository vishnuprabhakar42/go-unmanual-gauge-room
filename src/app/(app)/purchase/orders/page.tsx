import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { FilterSelect } from "@/components/data/filter-select";
import { PageHeader } from "@/components/data/page-header";
import { Pagination, parsePage } from "@/components/data/pagination";
import { SearchInput } from "@/components/data/search-input";
import { PO_TONE, StatusPill } from "@/components/data/status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/domain/india/format";
import { PO_STATUSES, type PoStatus } from "@/domain/purchase-status";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";

export const metadata: Metadata = { title: "Purchase orders" };
const PAGE_SIZE = 50;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const ctx = await requirePermission("po.manage");
  const t = await getTranslations();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const status = PO_STATUSES.includes(sp.status as PoStatus) ? (sp.status as PoStatus) : undefined;
  const plant = ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {};
  const where = {
    ...plant,
    ...(status ? { status } : {}),
    ...(sp.q
      ? {
          OR: [
            { number: { contains: sp.q, mode: "insensitive" as const } },
            { vendor: { name: { contains: sp.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const db = tenantDb(ctx.tenant);
  const [orders, total, ready] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { vendor: { select: { name: true } }, plant: { select: { code: true } }, _count: { select: { items: true } } },
    }),
    db.purchaseOrder.count({ where }),
    db.calibrationRequest.findMany({
      where: { ...plant, status: "APPROVED" },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { items: { where: { removedAt: null } } } } },
    }),
  ]);

  return (
    <>
      <PageHeader title={t("pos.title")} subtitle={t("pos.subtitle")} />
      {ready.length > 0 && (
        <Card className="mb-6 border-amber-300 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-base">{t("pos.readyTitle", { count: ready.length })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2" data-testid="ready-to-release">
            {ready.map((r) => (
              <Link key={r.id} href={`/requests/${r.id}`} className="hover:bg-muted rounded-md border px-3 py-2 text-sm">
                <span className="font-mono font-medium">{r.number}</span> ·{" "}
                {t("dashboard.instrumentsCount", { count: r._count.items })}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      {total === 0 && !sp.q && !status ? (
        <EmptyState icon={ShoppingCart} title={t("pos.emptyTitle")} body={t("pos.emptyBody")} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
            <div className="col-span-2 sm:w-72">
              <SearchInput placeholder={`${t("pos.number")} / ${t("pos.vendor")}`} />
            </div>
            <FilterSelect
              param="status"
              allLabel={t("requests.allStatuses")}
              options={PO_STATUSES.map((s) => ({ value: s, label: t(`poStatus.${s}`) }))}
            />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="po-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pos.number")}</TableHead>
                  <TableHead>{t("pos.vendor")}</TableHead>
                  <TableHead>{t("pos.status")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("pos.source")}</TableHead>
                  <TableHead className="text-right">{t("pos.total")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("pos.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        href={`/purchase/orders/${o.id}`}
                        className="font-mono font-medium underline-offset-4 hover:underline"
                      >
                        {o.number}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {t("dashboard.instrumentsCount", { count: o._count.items })}
                      </div>
                    </TableCell>
                    <TableCell>{o.vendor.name}</TableCell>
                    <TableCell>
                      <StatusPill label={t(`poStatus.${o.status}`)} tone={PO_TONE[o.status]} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{t(`poSource.${o.source}`)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(o.total.toNumber())}</TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDate(o.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} basePath="/purchase/orders" />
        </>
      )}
    </>
  );
}
