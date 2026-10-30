/**
 * Document numbering per plant and Indian financial year (1 April – 31 March, IST).
 *
 * Template tokens:
 *   {PREFIX} series prefix, e.g. "PO"
 *   {PLANT}  plant code, e.g. "PLT1"
 *   {FY}     financial year label, e.g. "26-27"
 *   {FYC}    compact financial year, e.g. "2627"
 *   {SEQ}    sequence, zero-padded to `padding` digits
 */
import { istParts } from "./india/format";

export const DOC_TYPES = ["CR", "RFQ", "PO", "DC", "GP"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** CGST Rule 55: challan serial number may not exceed 16 characters. */
export const MAX_LENGTH: Readonly<Partial<Record<DocType, number>>> = { DC: 16 };

export type SeriesDefaults = { prefix: string; template: string; padding: number };

export const DEFAULT_SERIES: Readonly<Record<DocType, SeriesDefaults>> = {
  CR: { prefix: "CR", template: "{PREFIX}/{PLANT}/{FY}/{SEQ}", padding: 4 },
  RFQ: { prefix: "RFQ", template: "{PREFIX}/{PLANT}/{FY}/{SEQ}", padding: 4 },
  PO: { prefix: "PO", template: "{PREFIX}/{PLANT}/{FY}/{SEQ}", padding: 4 },
  // DCPLT1/2627/0001 = 16 chars with a 4-char plant code (Rule 55 limit).
  DC: { prefix: "DC", template: "{PREFIX}{PLANT}/{FYC}/{SEQ}", padding: 4 },
  GP: { prefix: "GP", template: "{PREFIX}/{PLANT}/{FY}/{SEQ}", padding: 4 },
};

export type FinancialYear = {
  /** Calendar year in which the FY starts (FY 26-27 → 2026) */
  startYear: number;
  /** "26-27" */
  label: string;
  /** "2627" */
  compact: string;
};

export function financialYear(date: Date): FinancialYear {
  const { year, month } = istParts(date);
  const startYear = month >= 4 ? year : year - 1;
  const a = String(startYear % 100).padStart(2, "0");
  const b = String((startYear + 1) % 100).padStart(2, "0");
  return { startYear, label: `${a}-${b}`, compact: `${a}${b}` };
}

export type FormatInput = {
  template: string;
  prefix: string;
  plantCode: string;
  fy: FinancialYear;
  seq: number;
  padding: number;
};

const KNOWN_TOKENS = new Set(["PREFIX", "PLANT", "FY", "FYC", "SEQ"]);

export function formatDocNumber(input: FormatInput): string {
  const values: Record<string, string> = {
    PREFIX: input.prefix,
    PLANT: input.plantCode,
    FY: input.fy.label,
    FYC: input.fy.compact,
    SEQ: String(input.seq).padStart(input.padding, "0"),
  };
  return input.template.replace(/\{([A-Z]+)\}/g, (_, token: string) => {
    if (!KNOWN_TOKENS.has(token)) throw new Error(`Unknown numbering token {${token}}`);
    return values[token];
  });
}

export type TemplateCheck = { ok: true; example: string } | { ok: false; error: string; example?: string };

/** Validates a series template; for length-limited documents checks the widest number at `padding` digits. */
export function validateSeriesTemplate(
  docType: DocType,
  series: { template: string; prefix: string; padding: number },
  plantCode: string,
  fy: FinancialYear,
): TemplateCheck {
  if (!series.template.includes("{SEQ}")) return { ok: false, error: "Template must contain {SEQ}" };
  if (series.padding < 1 || series.padding > 8) return { ok: false, error: "Padding must be between 1 and 8" };
  let example: string;
  let widest: string;
  try {
    example = formatDocNumber({ ...series, plantCode, fy, seq: 1 });
    widest = formatDocNumber({ ...series, plantCode, fy, seq: 10 ** series.padding - 1 });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const max = MAX_LENGTH[docType];
  if (max !== undefined && widest.length > max) {
    return {
      ok: false,
      error: `${docType} numbers must be at most ${max} characters (got ${widest.length}: ${widest})`,
      example,
    };
  }
  return { ok: true, example };
}

/** Final guard used when a number is issued. */
export function assertWithinLimit(docType: DocType, value: string): void {
  const max = MAX_LENGTH[docType];
  if (max !== undefined && value.length > max) {
    throw new Error(`${docType} number "${value}" exceeds ${max} characters`);
  }
}
