import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { monthRange } from "@/domain/due";
import { formatINR } from "@/domain/india/format";
import { requirePermission } from "@/server/context";
import { parsePeriod, spendReport } from "@/server/services/reports";
import { tenantDb } from "@/server/tenant";
import { PeriodFilter } from "../period-filter";
import { plantLabel, qs } from "../plant-label";

export const metadata: Metadata = { title: "Calibration spend" };
const monthLabel = (k: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "Asia/Kolkata" }).format(monthRange(k).gte);

export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("report.view");
  const t = await getTranslations("reports");
  const p = parsePeriod(await searchParams, ctx.currentPlantId);
  const s = await spendReport(tenantDb(ctx.tenant), p);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("spendTitle")}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">{t("spendSubtitle")}</p>
      </div>
      <PeriodFilter
        from={p.fromInput}
        to={p.toInput}
        exportHref={`/api/reports/spend?${qs({ from: p.fromInput, to: p.toInput })}`}
        plantLabel={plantLabel(ctx, t("allPlants"))}
      />
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="spend">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0">{t("lab")}</TableHead>
              {s.months.map((m) => (
                <TableHead key={m} className="text-right whitespace-nowrap">
                  {monthLabel(m)}
                </TableHead>
              ))}
              <TableHead className="text-right">{t("total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.vendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={s.months.length + 2} className="text-muted-foreground py-8 text-center">
                  {t("noData")}
                </TableCell>
              </TableRow>
            ) : (
              s.vendors.map((v) => (
                <TableRow key={v.vendorName}>
                  <TableCell className="bg-background sticky left-0 font-medium">{v.vendorName}</TableCell>
                  {s.months.map((m) => (
                    <TableCell key={m} className="text-right whitespace-nowrap tabular-nums">
                      {v.byMonth[m] ? formatINR(v.byMonth[m]) : "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">{formatINR(v.total)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {s.vendors.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="sticky left-0">{t("total")}</TableCell>
                {s.months.map((m) => (
                  <TableCell key={m} className="text-right whitespace-nowrap tabular-nums">
                    {formatINR(s.monthTotals[m])}
                  </TableCell>
                ))}
                <TableCell className="text-right whitespace-nowrap tabular-nums" data-testid="spend-total">
                  {formatINR(s.grandTotal)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
