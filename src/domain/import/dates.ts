/**
 * Lenient date parsing for messy Indian spreadsheets. Results are midnight IST.
 * Accepts: Date objects (Excel date cells), Excel serial numbers, DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY,
 * DD/MM/YY, YYYY-MM-DD, DD-Mon-YYYY, DD Mon YY, Mon DD YYYY. Day-first is assumed (Indian convention);
 * if the second part can't be a month (e.g. 03/25/2025) it is read as month-first.
 */
import { istMidnight } from "../due";

export type DateParse = { ok: true; date: Date; note?: string } | { ok: false; error: string };

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function valid(y: number, m: number, d: number): boolean {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

function build(y: number, m: number, d: number, note?: string): DateParse {
  return valid(y, m, d) ? { ok: true, date: istMidnight(y, m, d), note } : { ok: false, error: "Not a real calendar date" };
}

export function fromExcelSerial(serial: number): DateParse {
  if (!Number.isFinite(serial) || serial < 18000 || serial > 80000)
    return { ok: false, error: "Number is not a plausible Excel date" };
  const d = new Date(EXCEL_EPOCH_UTC + Math.floor(serial) * 86_400_000);
  return build(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function parseFlexibleDate(value: unknown): DateParse | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { ok: false, error: "Invalid date" };
    // Spreadsheet date cells carry the calendar date in UTC fields.
    return build(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") return fromExcelSerial(value);

  const s = String(value).trim();
  if (s === "" || s === "-" || /^n\/?a$/i.test(s)) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return build(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = expandYear(+m[3]);
    if (b > 12 && a <= 12) return build(y, a, b, "Read as month-first (MM/DD)");
    return build(y, b, a);
  }

  m = s.match(/^(\d{1,2})[-/. ]?([A-Za-z]{3,9})[-/., ]*(\d{2}|\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return build(expandYear(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]);

  m = s.match(/^([A-Za-z]{3,9})[-/. ](\d{1,2}),?[-/. ](\d{2}|\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return build(expandYear(+m[3]), MONTHS[m[1].toLowerCase()], +m[2]);

  return { ok: false, error: `Unrecognised date "${s}"` };
}
