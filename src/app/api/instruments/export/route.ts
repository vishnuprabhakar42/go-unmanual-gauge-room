import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { formatDate } from "@/domain/india/format";
import { effectiveStandard } from "@/domain/standards";
import { getAppContext } from "@/server/context";
import { loadDueConfig } from "@/server/services/due-planning";
import { instrumentWhere } from "@/server/services/instruments";
import { tenantDb } from "@/server/tenant";
import { parseInstrumentParams } from "../../../(app)/instruments/search-params";

export const dynamic = "force-dynamic";
const MAX_ROWS = 50_000;

/** Excel export of the instrument list with the same filters as the screen (or ?ids=a,b,c). */
export async function GET(req: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!ctx.can("instrument.view")) return new Response("Forbidden", { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { filters, sort, dir } = parseInstrumentParams(sp, ctx.currentPlantId);
  if (sp.ids) filters.ids = sp.ids.split(",").filter(Boolean).slice(0, 5000);
  const db = tenantDb(ctx.tenant);

  const rows = await db.instrument.findMany({
    where: instrumentWhere(filters, await loadDueConfig(db)),
    orderBy: sort === "code" ? { code: dir } : [{ [sort]: { sort: dir, nulls: "last" } }, { code: "asc" }],
    take: MAX_ROWS,
    include: { type: true, plant: true, department: true, location: true },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Go Unmanual Gauge Room";
  const ws = wb.addWorksheet("Instruments", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Code", key: "code", width: 16 },
    { header: "Type", key: "type", width: 26 },
    { header: "Description", key: "description", width: 30 },
    { header: "Make", key: "make", width: 14 },
    { header: "Model", key: "model", width: 14 },
    { header: "Serial no.", key: "serialNo", width: 16 },
    { header: "Range min", key: "rangeMin", width: 10 },
    { header: "Range max", key: "rangeMax", width: 10 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Least count", key: "leastCount", width: 10 },
    { header: "Plant", key: "plant", width: 8 },
    { header: "Department", key: "department", width: 18 },
    { header: "Location", key: "location", width: 16 },
    { header: "Custodian", key: "custodian", width: 16 },
    { header: "Criticality", key: "criticality", width: 10 },
    { header: "Source", key: "source", width: 10 },
    { header: "Frequency", key: "frequency", width: 12 },
    { header: "Last calibrated", key: "last", width: 14 },
    { header: "Planning date", key: "planning", width: 14 },
    { header: "Next due", key: "next", width: 14 },
    { header: "Standard", key: "standard", width: 22 },
    { header: "Standard date", key: "standardDate", width: 14 },
    { header: "Adjustable", key: "adjustable", width: 14 },
    { header: "Status", key: "status", width: 18 },
    { header: "NABL required", key: "nabl", width: 12 },
    { header: "Value (INR)", key: "value", width: 12, style: { numFmt: "#,##,##0.00" } },
  ];
  ws.getRow(1).font = { bold: true };
  const n = (d: { toNumber(): number } | null) => (d == null ? null : d.toNumber());
  for (const r of rows) {
    ws.addRow({
      code: r.code,
      type: r.type.name,
      description: r.description,
      make: r.make,
      model: r.model,
      serialNo: r.serialNo,
      rangeMin: n(r.rangeMin),
      rangeMax: n(r.rangeMax),
      unit: r.unit,
      leastCount: n(r.leastCount),
      plant: r.plant.code,
      department: r.department?.name,
      location: r.location?.name,
      custodian: r.custodianName,
      criticality: r.criticality,
      source: r.calibrationSource,
      frequency: `${r.frequencyValue} ${r.frequencyUnit.toLowerCase()}`,
      last: formatDate(r.lastCalibratedAt),
      planning: formatDate(r.planningDate),
      next: formatDate(r.nextDueAt),
      standard: effectiveStandard(r).standardCode,
      standardDate: formatDate(effectiveStandard(r).standardDate),
      adjustable: r.adjustable == null ? null : r.adjustable ? "Adjustable" : "Non-adjustable",
      status: r.status,
      nabl: r.nablRequired ? "Yes" : "No",
      value: n(r.purchaseValue),
    });
  }
  ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columns.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = formatDate(new Date());
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="instruments-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
