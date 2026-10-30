import { FileSpreadsheet, Gauge, Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { FilterSelect } from "@/components/data/filter-select";
import { PageHeader } from "@/components/data/page-header";
import { Pagination, parsePage } from "@/components/data/pagination";
import { SavedViews } from "@/components/data/saved-views";
import { SearchInput } from "@/components/data/search-input";
import { Button } from "@/components/ui/button";
import { INSTRUMENT_STATUSES } from "@/domain/instrument-status";
import { requirePermission } from "@/server/context";
import { loadDueConfig } from "@/server/services/due-planning";
import { listInstruments } from "@/server/services/instruments";
import { tenantDb } from "@/server/tenant";
import { InstrumentsTable } from "./instruments-table";
import { toInstrumentRows } from "./rows";
import { parseInstrumentParams, type InstrumentSearchParams } from "./search-params";

export const metadata: Metadata = { title: "Instruments" };
const PAGE_SIZE = 50;

export default async function InstrumentsPage({ searchParams }: { searchParams: Promise<InstrumentSearchParams> }) {
  const ctx = await requirePermission("instrument.view");
  const t = await getTranslations();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const { filters, sort, dir } = parseInstrumentParams(sp, ctx.currentPlantId);
  const db = tenantDb(ctx.tenant);

  const due = await loadDueConfig(db);

  const [{ rows, total }, anyInstrument, types, departments, views] = await Promise.all([
    listInstruments(db, { filters, due, page, pageSize: PAGE_SIZE, sort, dir }),
    db.instrument.findFirst({ select: { id: true } }),
    db.instrumentType.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.department.findMany({
      where: { archivedAt: null, ...(ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {}) },
      select: { id: true, name: true, plant: { select: { code: true } } },
      orderBy: { name: "asc" },
    }),
    db.savedView.findMany({
      where: { page: "instruments", archivedAt: null, OR: [{ userId: ctx.user.id }, { shared: true }] },
      orderBy: { name: "asc" },
    }),
  ]);

  const canManage = ctx.can("instrument.manage");
  const tableRows = toInstrumentRows(rows);

  const exportQuery = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "page"),
  ).toString();

  if (!anyInstrument) {
    return (
      <>
        <PageHeader title={t("instruments.title")} subtitle={t("instruments.subtitle")} />
        <EmptyState
          icon={Gauge}
          title={t("instruments.emptyTitle")}
          body={t("instruments.emptyBody")}
          action={
            canManage && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild className="h-11">
                  <Link href="/instruments/import">
                    <Upload className="size-4" />
                    {t("instruments.import")}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11">
                  <Link href="/instruments/new">
                    <Plus className="size-4" />
                    {t("instruments.add")}
                  </Link>
                </Button>
              </div>
            )
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("instruments.title")}
        subtitle={t("instruments.subtitle")}
        actions={
          <>
            <SavedViews
              page="instruments"
              views={views.map((v) => ({
                id: v.id,
                name: v.name,
                query: v.query,
                shared: v.shared,
                mine: v.userId === ctx.user.id,
              }))}
            />
            <Button asChild variant="outline" className="h-10">
              <a href={`/api/instruments/export?${exportQuery}`} data-testid="export-excel">
                <FileSpreadsheet className="size-4" />
                {t("common.export")}
              </a>
            </Button>
            {canManage && (
              <>
                <Button asChild variant="outline" className="h-10">
                  <Link href="/instruments/import">
                    <Upload className="size-4" />
                    {t("instruments.import")}
                  </Link>
                </Button>
                <Button asChild className="h-10">
                  <Link href="/instruments/new">
                    <Plus className="size-4" />
                    {t("instruments.add")}
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <div className="col-span-2 sm:w-80">
          <SearchInput placeholder={t("instruments.searchPlaceholder")} />
        </div>
        <FilterSelect
          param="due"
          allLabel={t("instruments.allDue")}
          options={(["OVERDUE", "DUE_SOON", "OK", "NOT_SCHEDULED"] as const).map((d) => ({ value: d, label: t(`due.${d}`) }))}
        />
        <FilterSelect
          param="status"
          allLabel={t("instruments.allStatuses")}
          options={INSTRUMENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        />
        <FilterSelect
          param="type"
          allLabel={t("instruments.allTypes")}
          options={types.map((x) => ({ value: x.id, label: x.name }))}
        />
        <FilterSelect
          param="dept"
          allLabel={t("instruments.allDepartments")}
          options={departments.map((d) => ({ value: d.id, label: ctx.currentPlantId ? d.name : `${d.plant.code} · ${d.name}` }))}
        />
        <FilterSelect
          param="crit"
          allLabel={t("instruments.allCriticality")}
          options={(["A", "B", "C"] as const).map((c) => ({ value: c, label: t(`criticality.${c}`) }))}
        />
        <FilterSelect
          param="sort"
          allLabel={t("instruments.sortNextDue")}
          options={[
            { value: "code", label: t("instruments.sortCode") },
            { value: "planningDate", label: t("instruments.sortPlanning") },
            { value: "lastCalibratedAt", label: t("instruments.sortLastCal") },
            { value: "updatedAt", label: t("instruments.sortUpdated") },
          ]}
        />
      </div>
      <InstrumentsTable rows={tableRows} emptyLabel={t("instruments.noMatch")} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} basePath="/instruments" />
    </>
  );
}
