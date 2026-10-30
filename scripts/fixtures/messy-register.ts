/**
 * Builds a deliberately messy gauge register like the ones plants keep in Excel:
 * a title row, odd headers, mixed date formats (DD-MM-YYYY, DD/MM/YY, Excel serials, real date cells),
 * free-text frequencies and ranges, plus a few broken rows.
 *
 *   pnpm tsx scripts/fixtures/messy-register.ts [rows] [out.xlsx]
 */
import ExcelJS from "exceljs";

export const MESSY_HEADERS = [
  "Sr. No.",
  "Gauge ID",
  "Instrument Name",
  "Make",
  "M/C Sr No",
  "Range",
  "L.C.",
  "Dept.",
  "Location",
  "Cal Freq",
  "Last Cal Date",
  "Next Due",
  "Remarks",
];

const TYPES: [string, string, string][] = [
  ["Vernier Caliper", "0-150 mm", "0.02"],
  ["Outside Micrometer", "0-25 mm", "0.001"],
  ["Dial Gauge", "0-10 mm", "0.01"],
  ["Pressure Gauge", "0-10 bar", "0.2"],
  ["Plug Gauge", "", ""],
  ["Height Gauge", "0-300 mm", "0.02"],
  ["Digital Thermometer", "-50 to 200 °C", "0.1"],
  ["Torque Wrench", "20-100 Nm", "1"],
];
const MAKES = ["Mitutoyo", "Baker", "Insize", "Wika", "Fluke", "Tata", "Kristeel"];
const DEPTS = ["Machine Shop", "Assembly", "Quality Lab", "Press Shop"];
const LOCS = ["Cabinet A", "Cabinet B", "Cell 1", "Cell 2", "Bench 1"];
const FREQS = ["12", "12 months", "1 Year", "6 M", "Half Yearly", "180 days", "Yearly", "3 months"];

/** Deterministic PRNG so fixtures are stable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export type MessyOptions = { rows: number; codePrefix?: string; brokenRows?: boolean; seed?: number };

export async function buildMessyRegister(opts: MessyOptions): Promise<Buffer> {
  const rand = rng(opts.seed ?? 42);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const prefix = opts.codePrefix ?? "GR";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Gauge List");
  ws.addRow(["DEMO AUTO COMPONENTS — GAUGE MASTER LIST (Rev 7)"]);
  ws.addRow(MESSY_HEADERS);

  // Base = today minus up to ~13 months, so a spread of overdue / due soon / later
  const today = new Date();
  for (let i = 1; i <= opts.rows; i++) {
    const [type, range, lc] = pick(TYPES);
    const daysAgo = Math.floor(rand() * 400) + 1;
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysAgo));
    const dd = pad(d.getUTCDate());
    const mm = pad(d.getUTCMonth() + 1);
    const yyyy = d.getUTCFullYear();
    const fmt = i % 4;
    const lastCal: ExcelJS.CellValue =
      fmt === 0
        ? `${dd}-${mm}-${yyyy}`
        : fmt === 1
          ? `${dd}/${mm}/${String(yyyy).slice(2)}`
          : fmt === 2
            ? Math.round(d.getTime() / 86_400_000 + 25569)
            : d;
    ws.addRow([
      i,
      `${prefix}-${String(i).padStart(5, "0")}`,
      i % 7 === 0 ? type.toUpperCase() : type,
      pick(MAKES),
      `SN${100000 + i}`,
      range,
      lc,
      pick(DEPTS),
      pick(LOCS),
      pick(FREQS),
      lastCal,
      "",
      i % 50 === 0 ? "Handle with care" : "",
    ]);
  }

  if (opts.brokenRows !== false) {
    ws.addRow([
      opts.rows + 1,
      "",
      "Vernier Caliper",
      "Mitutoyo",
      "",
      "0-150 mm",
      "0.02",
      "Assembly",
      "Cabinet A",
      "12",
      "01-01-2026",
    ]); // missing code
    ws.addRow([
      opts.rows + 2,
      `${prefix}-BAD-DATE`,
      "Dial Gauge",
      "Baker",
      "",
      "0-10 mm",
      "0.01",
      "Assembly",
      "Cabinet A",
      "12",
      "31-02-2026",
    ]); // bad date
    ws.addRow([
      opts.rows + 3,
      `${prefix}-NEW-TYPE`,
      "Bore Gauge",
      "Mitutoyo",
      "",
      "18-35 mm",
      "0.001",
      "Quality Lab",
      "Bench 1",
      "12",
      "15/06/26",
    ]); // unknown type
    ws.addRow([
      opts.rows + 4,
      `${prefix}-00001`,
      "Vernier Caliper",
      "Mitutoyo",
      "",
      "0-150 mm",
      "0.02",
      "Assembly",
      "Cabinet A",
      "12",
      "01-01-2026",
    ]); // duplicate
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Header row is sheet row 2; data starts at row 3. */
export const MESSY_FIRST_DATA_ROW = 3;

if (process.argv[1]?.endsWith("messy-register.ts")) {
  const rows = Number(process.argv[2] ?? 2000);
  const out = process.argv[3] ?? "e2e/fixtures/messy-register.xlsx";
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await buildMessyRegister({ rows }));
  console.log(`Wrote ${out} (${rows} rows + 4 broken rows)`);
}
