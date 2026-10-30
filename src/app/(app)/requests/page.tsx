import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { FilterSelect } from "@/components/data/filter-select";
import { PageHeader } from "@/components/data/page-header";
import { Pagination, parsePage } from "@/components/data/pagination";
import { SearchInput } from "@/components/data/search-input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REQUEST_STATUSES, type RequestStatus } from "@/domain/calibration-request-status";
import { formatDate } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { RequestStatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Calibration requests" };
const PAGE_SIZE = 50;

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const ctx = await requireAnyPermission("calibration.request", "po.manage");
  const t = await getTranslations();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const status = REQUEST_STATUSES.includes(sp.status as RequestStatus) ? (sp.status as RequestStatus) : undefined;
  const where = {
    ...(ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {}),
    ...(status ? { status } : {}),
    ...(sp.q ? { number: { contains: sp.q.trim(), mode: "insensitive" as const } } : {}),
  };
  const db = tenantDb(ctx.tenant);
  const [rows, total, any] = await Promise.all([
    db.calibrationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { plant: { select: { code: true } }, _count: { select: { items: { where: { removedAt: null } } } } },
    }),
    db.calibrationRequest.count({ where }),
    db.calibrationRequest.findFirst({ select: { id: true } }),
  ]);
  const users = new Map(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.requestedById))] } },
        select: { id: true, name: true, email: true },
      })
    ).map((u) => [u.id, u.name ?? u.email]),
  );

  if (!any) {
    return (
      <>
        <PageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} />
        <EmptyState
          icon={ClipboardList}
          title={t("requests.emptyTitle")}
          body={t("requests.emptyBody")}
          action={
            <Button asChild className="h-11">
              <Link href="/due">{t("requests.goDue")}</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("requests.title")} subtitle={t("requests.subtitle")} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <div className="col-span-2 sm:w-72">
          <SearchInput placeholder={t("requests.number")} />
        </div>
        <FilterSelect
          param="status"
          allLabel={t("requests.allStatuses")}
          options={REQUEST_STATUSES.map((s) => ({ value: s, label: t(`requestStatus.${s}`) }))}
        />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("requests.number")}</TableHead>
              <TableHead>{t("requests.status")}</TableHead>
              <TableHead className="text-right">{t("requests.items")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("requests.dueWindow")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("requests.requestedBy")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("requests.createdAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/requests/${r.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                    {r.number}
                  </Link>
                </TableCell>
                <TableCell>
                  <RequestStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{r._count.items}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {r.dueWindowFrom ? `${formatDate(r.dueWindowFrom)} – ${formatDate(r.dueWindowTo)}` : "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell">{users.get(r.requestedById) ?? "—"}</TableCell>
                <TableCell className="hidden sm:table-cell">{formatDate(r.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} basePath="/requests" />
    </>
  );
}
