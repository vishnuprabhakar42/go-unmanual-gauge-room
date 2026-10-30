import { toDateInput } from "@/domain/india/format";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { SearchInput } from "@/components/data/search-input";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { TypeDialog } from "./type-dialog";
import { TypesTable } from "./types-table";

export const metadata: Metadata = { title: "Instrument types" };

export default async function TypesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePermission("masters.manage");
  const t = await getTranslations("masters");
  const { q } = await searchParams;
  const db = tenantDb(ctx.tenant);
  const [types, counts] = await Promise.all([
    db.instrumentType.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : {},
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    }),
    db.instrument.groupBy({ by: ["typeId"], where: { archivedAt: null }, _count: { _all: true } }),
  ]);
  const countBy = new Map(counts.map((c) => [c.typeId, c._count._all]));
  return (
    <>
      <PageHeader title={t("types")} subtitle={t("typesSubtitle")} actions={<TypeDialog />} />
      <div className="mb-4">
        <SearchInput placeholder={t("name")} />
      </div>
      <TypesTable
        rows={types.map((x) => ({
          id: x.id,
          name: x.name,
          category: x.category,
          parameter: x.parameter,
          unit: x.unit,
          defaultFrequencyValue: x.defaultFrequencyValue,
          defaultFrequencyUnit: x.defaultFrequencyUnit,
          defaultTolerance: x.defaultTolerance,
          nablRequired: x.nablRequired,
          hsnCode: x.hsnCode,
          defaultLeadTimeDays: x.defaultLeadTimeDays,
          standardCode: x.standardCode,
          standardDate: toDateInput(x.standardDate),
          instruments: countBy.get(x.id) ?? 0,
          archived: !!x.archivedAt,
        }))}
      />
    </>
  );
}
