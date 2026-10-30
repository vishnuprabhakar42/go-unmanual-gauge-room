import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { RawCell } from "@/domain/import/validate";

export type ParsedSheet = { sheetName: string; rows: RawCell[][] };

export const MAX_IMPORT_ROWS = 25_000;

function toRaw(value: ExcelJS.CellValue): RawCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value instanceof Date) {
    // Excel date cells: calendar date lives in the UTC fields
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "object") {
    if ("richText" in value)
      return (
        value.richText
          .map((r) => r.text)
          .join("")
          .trim() || null
      );
    if ("result" in value) return toRaw(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text).trim() || null;
    if ("error" in value) return null;
  }
  return String(value);
}

/** Reads the first non-empty worksheet of an .xlsx, or a .csv, into a grid of raw cells. */
export async function parseSpreadsheet(data: ArrayBuffer, fileName: string): Promise<ParsedSheet> {
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    return {
      sheetName: fileName,
      rows: parsed.data.slice(0, MAX_IMPORT_ROWS + 20).map((r) => r.map((c) => (c.trim() === "" ? null : c.trim()))),
    };
  }
  if (!/\.xlsx$/i.test(fileName)) throw new Error("Upload an .xlsx or .csv file (save .xls files as .xlsx first)");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const sheet = wb.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) throw new Error("The workbook has no data");
  const width = sheet.actualColumnCount || sheet.columnCount;
  const rows: RawCell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > MAX_IMPORT_ROWS + 20) return;
    const cells: RawCell[] = [];
    for (let c = 1; c <= width; c++) cells.push(toRaw(row.getCell(c).value));
    rows[rowNumber - 1] = cells;
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= new Array<RawCell>(width).fill(null);
  return { sheetName: sheet.name, rows };
}
