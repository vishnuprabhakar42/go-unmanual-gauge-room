import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { FilterSelect } from "@/components/data/filter-select";
import { Pagination, parsePage } from "@/components/data/pagination";
import { SearchInput } from "@/components/data/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHALLAN_STATUSES, type ChallanStatus as Status } from "@/domain/challan";
import { formatDate } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { ChallanStatus } from "../challan-status";

export const metadata: Metadata = { title: "Challans" };
const PAGE_SIZE = 50;

export default async function ChallansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const ctx = await requireAnyPermission("dispatch.manage", "receipt.manage");
  const t = await getTranslations();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const status = CHALLAN_STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const where = {
    ...(ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {}),
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
  const [rows, total] = await Promise.all([
    db.deliveryChallan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { vendor: { select: { name: true } }, po: { select: { number: true } }, items: { select: { returnedAt: true } } },
    }),
    db.deliveryChallan.count({ where }),
  ]);
  if (!total && !sp.q && !status)
    return <EmptyState icon={FileText} title={t("dispatch.emptyTitle")} body={t("dispatch.emptyBody")} />;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <div className="col-span-2 sm:w-72">
          <SearchInput placeholder={`${t("dispatch.number")} / ${t("dispatch.vendor")}`} />
        </div>
        <FilterSelect
          param="status"
          allLabel={t("requests.allStatuses")}
          options={CHALLAN_STATUSES.map((s) => ({ value: s, label: t(`challanStatus.${s}`) }))}
        />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="challan-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t("dispatch.number")}</TableHead>
              <TableHead>{t("dispatch.vendor")}</TableHead>
              <TableHead>{t("dispatch.status")}</TableHead>
              <TableHead className="text-right">{t("dispatch.returned")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("dispatch.dispatchedAt")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("dispatch.expectedReturn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/dispatch/challans/${c.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                    {c.number ?? t("dispatch.draftNumber")}
                  </Link>
                  <div className="text-muted-foreground font-mono text-xs">{c.po.number}</div>
                </TableCell>
                <TableCell>{c.vendor.name}</TableCell>
                <TableCell>
                  <ChallanStatus status={c.status} dispatched={!!c.dispatchedAt} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.items.filter((i) => i.returnedAt).length}/{c.items.length}
                </TableCell>
                <TableCell className="hidden md:table-cell">{formatDate(c.dispatchedAt) || "—"}</TableCell>
                <TableCell className="hidden md:table-cell">{formatDate(c.expectedReturnAt) || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} basePath="/dispatch/challans" />
    </>
  );
}
