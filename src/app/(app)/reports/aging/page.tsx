import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/domain/india/format";
import { requirePermission } from "@/server/context";
import { atVendorAgingReport } from "@/server/services/reports";
import { tenantDb } from "@/server/tenant";
import { PeriodFilter } from "../period-filter";
import { plantLabel } from "../plant-label";

export const metadata: Metadata = { title: "At-vendor aging" };

export default async function AgingPage() {
  const ctx = await requirePermission("report.view");
  const t = await getTranslations("reports");
  const rows = await atVendorAgingReport(tenantDb(ctx.tenant), ctx.currentPlantId);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("agingTitle")}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">{t("agingSubtitle")}</p>
      </div>
      <PeriodFilter exportHref="/api/reports/aging" plantLabel={plantLabel(ctx, t("allPlants"))} />
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="aging">
          <TableHeader>
            <TableRow>
              <TableHead>{t("instrument")}</TableHead>
              <TableHead>{t("lab")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("challan")}</TableHead>
              <TableHead>{t("sent")}</TableHead>
              <TableHead>{t("expected")}</TableHead>
              <TableHead className="text-right">{t("daysOut")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                  {t("nothingOut")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.instrumentId}
                  className={r.late ? "bg-red-50 dark:bg-red-950/40" : undefined}
                  data-late={r.late || undefined}
                >
                  <TableCell>
                    <Link
                      href={`/instruments/${r.instrumentId}`}
                      className="font-mono font-medium underline-offset-4 hover:underline"
                    >
                      {r.code}
                    </Link>
                    <div className="text-muted-foreground text-xs">{r.type}</div>
                  </TableCell>
                  <TableCell>{r.vendor}</TableCell>
                  <TableCell className="hidden font-mono text-sm md:table-cell">{r.challan ?? "—"}</TableCell>
                  <TableCell>{formatDate(r.sentAt)}</TableCell>
                  <TableCell>{formatDate(r.expected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.days}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
