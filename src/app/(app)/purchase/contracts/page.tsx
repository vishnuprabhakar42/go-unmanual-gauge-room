import { FileSignature, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/data/page-header";
import { CONTRACT_TONE, StatusPill } from "@/components/data/status-pill";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/domain/india/format";
import { effectiveContractStatus } from "@/domain/purchase-status";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";

export const metadata: Metadata = { title: "Rate contracts" };

export default async function ContractsPage() {
  const ctx = await requirePermission("rateContract.manage");
  const t = await getTranslations();
  const contracts = await tenantDb(ctx.tenant).rateContract.findMany({
    where: { archivedAt: null, ...(ctx.currentPlantId ? { OR: [{ plantId: null }, { plantId: ctx.currentPlantId }] } : {}) },
    orderBy: [{ status: "asc" }, { validTo: "desc" }],
    include: {
      vendor: { select: { name: true } },
      plant: { select: { code: true } },
      _count: { select: { items: { where: { archivedAt: null } } } },
    },
  });
  const add = (
    <Button asChild className="h-10">
      <Link href="/purchase/contracts/new">
        <Plus className="size-4" />
        {t("contracts.add")}
      </Link>
    </Button>
  );
  if (!contracts.length) {
    return (
      <>
        <PageHeader title={t("contracts.title")} subtitle={t("contracts.subtitle")} />
        <EmptyState icon={FileSignature} title={t("contracts.emptyTitle")} body={t("contracts.emptyBody")} action={add} />
      </>
    );
  }
  return (
    <>
      <PageHeader title={t("contracts.title")} subtitle={t("contracts.subtitle")} actions={add} />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("contracts.number")}</TableHead>
              <TableHead>{t("contracts.vendor")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("contracts.plant")}</TableHead>
              <TableHead>{t("contracts.validity")}</TableHead>
              <TableHead>{t("contracts.status")}</TableHead>
              <TableHead className="text-right">{t("contracts.items")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((c) => {
              const status = effectiveContractStatus(c);
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/purchase/contracts/${c.id}`}
                      className="font-mono font-medium underline-offset-4 hover:underline"
                    >
                      {c.number}
                    </Link>
                  </TableCell>
                  <TableCell>{c.vendor.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.plant?.code ?? t("contracts.allPlants")}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(c.validFrom)} – {formatDate(c.validTo)}
                  </TableCell>
                  <TableCell>
                    <StatusPill label={t(`contractStatus.${status}`)} tone={CONTRACT_TONE[status]} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c._count.items}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
