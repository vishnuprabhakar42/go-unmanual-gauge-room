import { Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { FilterSelect } from "@/components/data/filter-select";
import { PageHeader } from "@/components/data/page-header";
import { SearchInput } from "@/components/data/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACCREDITATION_TYPES } from "@/domain/vendor-schemas";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { NablBadge } from "./nabl-badge";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ q?: string; acc?: string }> }) {
  const ctx = await requirePermission("vendor.view");
  const t = await getTranslations();
  const sp = await searchParams;
  const acc = ACCREDITATION_TYPES.find((a) => a === sp.acc);
  const db = tenantDb(ctx.tenant);
  const vendors = await db.vendor.findMany({
    where: {
      ...(acc ? { accreditationType: acc } : {}),
      ...(sp.q
        ? {
            OR: [
              { name: { contains: sp.q, mode: "insensitive" } },
              { gstin: { contains: sp.q, mode: "insensitive" } },
              { nablCertNo: { contains: sp.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      links: { where: { organizationId: ctx.org.id }, select: { isApproved: true, archivedAt: true } },
      _count: {
        select: {
          scopes: { where: { archivedAt: null } },
          rateContracts: { where: { organizationId: ctx.org.id, status: "ACTIVE" } },
        },
      },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
  const canManage = ctx.can("vendor.manage");
  const add = canManage && (
    <Button asChild className="h-10">
      <Link href="/vendors/new">
        <Plus className="size-4" />
        {t("vendors.add")}
      </Link>
    </Button>
  );

  if (!vendors.length && !sp.q && !acc) {
    return (
      <>
        <PageHeader title={t("vendors.title")} subtitle={t("vendors.subtitle")} />
        <EmptyState icon={Building2} title={t("vendors.emptyTitle")} body={t("vendors.emptyBody")} action={add} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("vendors.title")} subtitle={t("vendors.subtitle")} actions={add} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <div className="col-span-2 sm:w-72">
          <SearchInput placeholder={t("vendors.name")} />
        </div>
        <FilterSelect
          param="acc"
          allLabel={t("vendors.allAccreditation")}
          options={ACCREDITATION_TYPES.map((a) => ({ value: a, label: t(`accreditation.${a}`) }))}
        />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("vendors.name")}</TableHead>
              <TableHead>{t("vendors.accreditation")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("vendors.gstin")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{t("vendors.scope")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{t("vendors.contracts")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((v) => {
              const link = v.links[0];
              return (
                <TableRow key={v.id} className={link?.archivedAt ? "opacity-60" : undefined}>
                  <TableCell>
                    <Link href={`/vendors/${v.id}`} className="font-medium underline-offset-4 hover:underline">
                      {v.name}
                    </Link>
                    <div className="mt-1">
                      {link?.isApproved ? (
                        <Badge variant="secondary">{t("vendors.approvedBadge")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("vendors.notApproved")}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <NablBadge type={v.accreditationType} validUntil={v.nablValidUntil} />
                    {v.nablCertNo && <div className="text-muted-foreground mt-1 font-mono text-xs">{v.nablCertNo}</div>}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">{v.gstin ?? "—"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{v._count.scopes}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{v._count.rateContracts}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
