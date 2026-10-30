import { FileQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/data/page-header";
import { RFQ_TONE, StatusPill } from "@/components/data/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";

export const metadata: Metadata = { title: "RFQs" };

export default async function RfqsPage() {
  const ctx = await requireAnyPermission("rfq.manage", "quote.techApprove");
  const t = await getTranslations();
  const rfqs = await tenantDb(ctx.tenant).rfq.findMany({
    where: ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      request: { select: { number: true, _count: { select: { items: { where: { removedAt: null, sourcing: "RFQ" } } } } } },
      _count: { select: { vendors: true, quotes: true } },
    },
  });
  if (!rfqs.length) {
    return (
      <>
        <PageHeader title={t("rfqs.title")} subtitle={t("rfqs.subtitle")} />
        <EmptyState icon={FileQuestion} title={t("rfqs.emptyTitle")} body={t("rfqs.emptyBody")} />
      </>
    );
  }
  return (
    <>
      <PageHeader title={t("rfqs.title")} subtitle={t("rfqs.subtitle")} />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("rfqs.number")}</TableHead>
              <TableHead>{t("rfqs.status")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("rfqs.request")}</TableHead>
              <TableHead className="text-right">{t("rfqs.items")}</TableHead>
              <TableHead className="text-right">{t("rfqs.quotes")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("rfqs.due")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rfqs.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/purchase/rfqs/${r.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                    {r.number}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusPill label={t(`rfqStatus.${r.status}`)} tone={RFQ_TONE[r.status]} />
                </TableCell>
                <TableCell className="hidden font-mono sm:table-cell">{r.request.number}</TableCell>
                <TableCell className="text-right tabular-nums">{r.request._count.items}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r._count.quotes}/{r._count.vendors}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{formatDate(r.dueAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
