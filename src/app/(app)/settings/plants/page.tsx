import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { Pagination, parsePage } from "@/components/data/pagination";
import { SearchInput } from "@/components/data/search-input";
import { GST_STATES } from "@/domain/india/states";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { PlantDialog } from "./plant-dialog";
import { PlantsTable } from "./plants-table";

export const metadata: Metadata = { title: "Plants" };
const PAGE_SIZE = 25;

export default async function PlantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await requirePermission("plant.manage");
  const t = await getTranslations();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const q = sp.q?.trim();
  const where = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] }
    : {};
  const db = tenantDb(ctx.tenant);
  const [rows, total] = await Promise.all([
    db.plant.findMany({
      where,
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { code: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.plant.count({ where }),
  ]);

  return (
    <>
      <PageHeader title={t("plants.title")} subtitle={t("plants.subtitle")} actions={<PlantDialog mode="create" />} />
      <div className="mb-4">
        <SearchInput placeholder={t("common.search")} />
      </div>
      <PlantsTable
        rows={rows.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          gstin: p.gstin,
          address: p.address,
          state: p.stateCode ? `${p.stateCode} · ${GST_STATES[p.stateCode] ?? ""}` : null,
          archived: !!p.archivedAt,
        }))}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} basePath="/settings/plants" />
    </>
  );
}
