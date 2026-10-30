import type { NextRequest } from "next/server";
import { monthRange } from "@/domain/due";
import { formatDate } from "@/domain/india/format";
import { getAppContext } from "@/server/context";
import { INR_FORMAT, workbookResponse } from "@/server/excel";
import { atVendorAgingReport, dueListReport, parsePeriod, spendReport, vendorPerformanceReport } from "@/server/services/reports";
import { tenantDb } from "@/server/tenant";

export const dynamic = "force-dynamic";

/** Excel exports of the report screens, with the same period (?from&to) and plant selection. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!ctx.can("report.view")) return new Response("Forbidden", { status: 403 });
  const db = tenantDb(ctx.tenant);
  const p = parsePeriod(Object.fromEntries(req.nextUrl.searchParams.entries()), ctx.currentPlantId);
  const plant = ctx.plants.find((x) => x.id === ctx.currentPlantId)?.code ?? "all-plants";
  const title = (name: string, period = true) =>
    `${name} — ${ctx.org.name} — ${plant}${period ? ` — ${formatDate(p.from)} to ${formatDate(p.to)}` : ""}`;
  const file = (name: string) => `${name}-${plant}-${formatDate(new Date())}.xlsx`;

  switch (kind) {
    case "vendors": {
      const rows = await vendorPerformanceReport(db, p);
      return workbookResponse(file("vendor-performance"), [
        {
          name: "Vendor performance",
          title: title("Vendor performance"),
          columns: [
            { header: "Lab", key: "vendorName", width: 36 },
            { header: "Sent", key: "jobs" },
            { header: "Returned", key: "returned" },
            { header: "On time", key: "onTime" },
            { header: "On-time %", key: "onTimePct" },
            { header: "Avg. TAT (days)", key: "avgTatDays" },
            { header: "Verified", key: "verified" },
            { header: "Failed", key: "failed" },
            { header: "OOT rate %", key: "ootRatePct" },
          ],
          rows,
        },
      ]);
    }
    case "spend": {
      const s = await spendReport(db, p);
      const label = (m: string) =>
        new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(monthRange(m).gte);
      return workbookResponse(file("calibration-spend"), [
        {
          name: "Spend",
          title: title("Calibration spend (excl. GST, INR)"),
          columns: [
            { header: "Lab", key: "vendor", width: 36 },
            ...s.months.map((m) => ({ header: label(m), key: m, numFmt: INR_FORMAT })),
            { header: "Total", key: "total", numFmt: INR_FORMAT, width: 16 },
          ],
          rows: [
            ...s.vendors.map((v) => ({ vendor: v.vendorName, ...v.byMonth, total: v.total })),
            { vendor: "Total", ...s.monthTotals, total: s.grandTotal },
          ],
        },
      ]);
    }
    case "aging": {
      const rows = await atVendorAgingReport(db, ctx.currentPlantId);
      return workbookResponse(file("at-vendor-aging"), [
        {
          name: "At vendor",
          title: title("At-vendor aging", false),
          columns: [
            { header: "Instrument", key: "code", width: 16 },
            { header: "Type", key: "type", width: 28 },
            { header: "Lab", key: "vendor", width: 34 },
            { header: "PO", key: "po", width: 22 },
            { header: "Challan", key: "challan", width: 18 },
            { header: "Sent", key: "sent" },
            { header: "Expected back", key: "expected" },
            { header: "Days out", key: "days" },
            { header: "Bucket", key: "bucket" },
            { header: "Late", key: "lateText" },
          ],
          rows: rows.map((r) => ({
            ...r,
            sent: formatDate(r.sentAt),
            expected: formatDate(r.expected),
            lateText: r.late ? "Yes" : "",
          })),
        },
      ]);
    }
    case "due": {
      const rows = await dueListReport(db, ctx.currentPlantId);
      return workbookResponse(file("due-list"), [
        {
          name: "Due list",
          title: title("Due list (overdue and due soon)", false),
          columns: [
            { header: "Code", key: "code", width: 16 },
            { header: "Type", key: "type", width: 28 },
            { header: "Description", key: "description", width: 28 },
            { header: "Serial no.", key: "serialNo", width: 16 },
            { header: "Plant", key: "plant", width: 8 },
            { header: "Department", key: "department", width: 18 },
            { header: "Location", key: "location", width: 16 },
            { header: "Last calibrated", key: "last" },
            { header: "Next due", key: "next" },
            { header: "Days to due", key: "days" },
            { header: "Status", key: "status", width: 18 },
            { header: "Source", key: "calibrationSource" },
          ],
          rows: rows.map((r) => ({
            ...r,
            type: r.type.name,
            plant: r.plant.code,
            department: r.department?.name,
            location: r.location?.name,
            last: formatDate(r.lastCalibratedAt),
            next: formatDate(r.nextDueAt),
            days: r.nextDueAt ? Math.ceil((r.nextDueAt.getTime() - Date.now()) / 86_400_000) : null,
          })),
        },
      ]);
    }
    default:
      return new Response("Not found", { status: 404 });
  }
}
