import "server-only";
import ExcelJS from "exceljs";

export type SheetColumn = { header: string; key: string; width?: number; numFmt?: string };
export type Sheet = { name: string; columns: SheetColumn[]; rows: Record<string, unknown>[]; title?: string };

export const INR_FORMAT = "#,##,##0.00";

/** One workbook, one sheet per entry: bold frozen header, auto-filter, optional title row above. */
export async function workbookResponse(fileName: string, sheets: Sheet[]): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Go Unmanual Gauge Room";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    const offset = s.title ? 2 : 0;
    if (s.title) {
      ws.getCell("A1").value = s.title;
      ws.getCell("A1").font = { bold: true, size: 12 };
    }
    ws.views = [{ state: "frozen", ySplit: offset + 1 }];
    s.columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width ?? 14;
      if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
    });
    const header = ws.getRow(offset + 1);
    header.values = s.columns.map((c) => c.header);
    header.font = { bold: true };
    for (const r of s.rows) ws.addRow(s.columns.map((c) => r[c.key] ?? null));
    ws.autoFilter = { from: { row: offset + 1, column: 1 }, to: { row: offset + 1, column: s.columns.length } };
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
