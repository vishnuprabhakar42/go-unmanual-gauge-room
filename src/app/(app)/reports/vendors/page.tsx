import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/server/context";
import { parsePeriod, vendorPerformanceReport } from "@/server/services/reports";
import { tenantDb } from "@/server/tenant";
import { PeriodFilter } from "../period-filter";
import { plantLabel, qs } from "../plant-label";

export const metadata: Metadata = { title: "Vendor performance" };
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

export default async function VendorPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("report.view");
  const t = await getTranslations("reports");
  const p = parsePeriod(await searchParams, ctx.currentPlantId);
  const rows = await vendorPerformanceReport(tenantDb(ctx.tenant), p);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("vendorsTitle")}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">{t("vendorsSubtitle")}</p>
      </div>
      <PeriodFilter
        from={p.fromInput}
        to={p.toInput}
        exportHref={`/api/reports/vendors?${qs({ from: p.fromInput, to: p.toInput })}`}
        plantLabel={plantLabel(ctx, t("allPlants"))}
      />
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="vendor-performance">
          <TableHeader>
            <TableRow>
              <TableHead>{t("lab")}</TableHead>
              <TableHead className="text-right">{t("jobs")}</TableHead>
              <TableHead className="text-right">{t("returned")}</TableHead>
              <TableHead className="text-right">{t("onTime")}</TableHead>
              <TableHead className="text-right">{t("avgTat")}</TableHead>
              <TableHead className="hidden text-right md:table-cell">{t("verified")}</TableHead>
              <TableHead className="text-right">{t("ootRate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  {t("noData")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.vendorId}>
                  <TableCell className="font-medium">{r.vendorName}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.jobs}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.returned}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.onTimePct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.avgTatDays ?? "—"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{r.verified}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.ootRatePct)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
