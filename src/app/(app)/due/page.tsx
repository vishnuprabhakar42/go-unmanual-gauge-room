import { CalendarCheck } from "lucide-react";
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
import { monthRange, upcomingMonths } from "@/domain/due";
import { requirePermission } from "@/server/context";
import { loadDueConfig } from "@/server/services/due-planning";
import { listInstruments } from "@/server/services/instruments";
import { tenantDb } from "@/server/tenant";
import { InstrumentsTable } from "../instruments/instruments-table";
import { toInstrumentRows } from "../instruments/rows";
import { parseInstrumentParams, type InstrumentSearchParams } from "../instruments/search-params";

export const metadata: Metadata = { title: "Due planning" };
const PAGE_SIZE = 100;

const monthLabel = (key: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(monthRange(key).gte);

export default async function DuePage({ searchParams }: { searchParams: Promise<InstrumentSearchParams> }) {
  const ctx = await requirePermission("calibration.request");
  const t = await getTranslations();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  // Defaults for planning: overdue + due soon, soonest first, hide instruments already on an open request
  const { filters } = parseInstrumentParams(
    { due: sp.month ? undefined : "ACTION", ...sp, open: sp.open ?? "0" },
    ctx.currentPlantId,
  );
  if (filters.due === undefined && !filters.month) filters.due = "ACTION";
  const db = tenantDb(ctx.tenant);
  const due = await loadDueConfig(db);

  const [{ rows, total }, types, departments, views] = await Promise.all([
    listInstruments(db, { filters, due, page, pageSize: PAGE_SIZE, sort: "nextDueAt", dir: "asc" }),
    db.instrumentType.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.department.findMany({
      where: { archivedAt: null, ...(ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {}) },
      select: { id: true, name: true, plant: { select: { code: true } } },
      orderBy: { name: "asc" },
    }),
    db.savedView.findMany({
      where: { page: "due", archivedAt: null, OR: [{ userId: ctx.user.id }, { shared: true }] },
      orderBy: { name: "asc" },
    }),
  ]);

  const showRequested = sp.open === "1";
  const toggleRequested = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "page"));
  toggleRequested.set("open", showRequested ? "0" : "1");

  return (
    <>
      <PageHeader
        title={t("duePlanning.title")}
        subtitle={t("duePlanning.subtitle")}
        actions={
          <>
            <SavedViews
              page="due"
              views={views.map((v) => ({
                id: v.id,
                name: v.name,
                query: v.query,
                shared: v.shared,
                mine: v.userId === ctx.user.id,
              }))}
            />
            <Button asChild variant="outline" className="h-10">
              <Link href={`/due?${toggleRequested.toString()}`}>
                {showRequested ? t("duePlanning.hideRequested") : t("duePlanning.showRequested")}
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <div className="col-span-2 sm:w-72">
          <SearchInput placeholder={t("instruments.searchPlaceholder")} />
        </div>
        <FilterSelect
          param="due"
          allLabel={sp.month ? t("due.anyState") : t("due.ACTION")}
          options={(["OVERDUE", "DUE_SOON", "OK"] as const).map((d) => ({ value: d, label: t(`due.${d}`) }))}
        />
        <FilterSelect
          param="month"
          allLabel={t("due.anyMonth")}
          options={upcomingMonths(6).map((m) => ({ value: m, label: monthLabel(m) }))}
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
      </div>
      {total === 0 ? (
        <EmptyState icon={CalendarCheck} title={t("duePlanning.emptyTitle")} body={t("duePlanning.emptyBody")} />
      ) : (
        <>
          <InstrumentsTable rows={toInstrumentRows(rows)} emptyLabel={t("instruments.noMatch")} mode="due" />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} basePath="/due" />
        </>
      )}
    </>
  );
}
