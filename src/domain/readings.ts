/**
 * Calibration readings maths. Simple acceptance (ILAC-G8 "simple acceptance"): a point passes when
 * |as-left − nominal| ≤ permissible error. As-found readings (before adjustment) are judged the same way
 * so an out-of-tolerance *as found* condition is caught even when the lab adjusted the instrument.
 * Values are rounded to 6 decimals to avoid binary floating-point noise (0.1 + 0.2).
 */
export type ReadingInput = {
  pointLabel: string;
  nominal: number;
  asFound: number | null;
  asLeft: number;
  permissibleError: number;
  uncertainty: number | null;
};

export type ComputedReading = ReadingInput & {
  error: number;
  pass: boolean;
  asFoundError: number | null;
  asFoundPass: boolean | null;
  /** passes, but |error| + U exceeds the limit (worth noting; not a fail under simple acceptance) */
  marginal: boolean;
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function computeReading(r: ReadingInput): ComputedReading {
  const limit = Math.abs(r.permissibleError);
  const error = round6(r.asLeft - r.nominal);
  const pass = Math.abs(error) <= limit + 1e-9;
  const asFoundError = r.asFound == null ? null : round6(r.asFound - r.nominal);
  const asFoundPass = asFoundError == null ? null : Math.abs(asFoundError) <= limit + 1e-9;
  const marginal = pass && r.uncertainty != null && Math.abs(error) + Math.abs(r.uncertainty) > limit + 1e-9;
  return { ...r, error, pass, asFoundError, asFoundPass, marginal };
}

export type OverallResult = { result: "PASS" | "FAIL"; failedPoints: number; asFoundFailed: boolean; anyMarginal: boolean };

/** Any as-left failure → FAIL. */
export function overallResult(readings: readonly ComputedReading[]): OverallResult {
  if (!readings.length) throw new Error("Enter at least one reading");
  const failed = readings.filter((r) => !r.pass).length;
  return {
    result: failed ? "FAIL" : "PASS",
    failedPoints: failed,
    asFoundFailed: readings.some((r) => r.asFoundPass === false),
    anyMarginal: readings.some((r) => r.marginal),
  };
}

/**
 * Pasted readings (Excel rows): label, nominal, as-found, as-left, permissible error, uncertainty.
 * A row with only 4 numbers is read as nominal, as-left, permissible, uncertainty (no as-found).
 */
export function parseReadingsPaste(text: string): { rows: ReadingInputDraft[]; errors: string[] } {
  const rows: ReadingInputDraft[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .forEach((line, i) => {
      const cells = line.split("\t").map((c) => c.trim().replace(/[±+]/g, "").replace(/,/g, ""));
      const label = cells[0] && Number.isNaN(Number(cells[0])) ? cells.shift()! : `Point ${i + 1}`;
      const nums = cells.map((c) => (c === "" ? "" : c));
      if (nums.length < 3) return void errors.push(`Line ${i + 1}: need at least nominal, as-left and permissible error`);
      const [nominal, a, b, c, d] = nums;
      rows.push(
        nums.length >= 5
          ? { pointLabel: label, nominal, asFound: a, asLeft: b, permissibleError: c, uncertainty: d ?? "" }
          : { pointLabel: label, nominal, asFound: "", asLeft: a, permissibleError: b, uncertainty: c ?? "" },
      );
    });
  return { rows, errors };
}

export type ReadingInputDraft = {
  pointLabel: string;
  nominal: string;
  asFound: string;
  asLeft: string;
  permissibleError: string;
  uncertainty: string;
};

/** Draft (strings) → numbers, or a validation message. */
export function draftToReading(d: ReadingInputDraft): ReadingInput | string {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const nominal = num(d.nominal);
  const asLeft = num(d.asLeft);
  const permissible = num(d.permissibleError);
  const asFound = num(d.asFound);
  const u = num(d.uncertainty);
  if (nominal == null || asLeft == null || permissible == null)
    return `${d.pointLabel || "Point"}: nominal, as-left and permissible error are required`;
  if ([nominal, asLeft, permissible, asFound ?? 0, u ?? 0].some((n) => !Number.isFinite(n)))
    return `${d.pointLabel || "Point"}: values must be numbers`;
  return {
    pointLabel: d.pointLabel.trim() || `${nominal}`,
    nominal,
    asFound,
    asLeft,
    permissibleError: Math.abs(permissible),
    uncertainty: u,
  };
}

/**
 * Default permissible error from a tolerance text: "±0.02 mm" → 0.02; "±1% FS" → 1% of the range span.
 * Reading-relative ("% rdg"), grades and IT classes vary per point → null (the verifier enters them).
 */
export function permissibleFromTolerance(
  text: string | null | undefined,
  range: { min: number | null; max: number | null },
): number | null {
  const s = (text ?? "").trim();
  const pct = s.match(/^±?\s*(\d+(?:\.\d+)?)\s*%\s*(FS|F\.S\.|full scale)$/i);
  if (pct) return range.max == null ? null : Math.round((Number(pct[1]) / 100) * (range.max - (range.min ?? 0)) * 1e6) / 1e6;
  const abs = s.match(/^±?\s*(\d+(?:\.\d+)?)\s*([a-zµ°]+(?:\s?[a-z]+)?)?$/i);
  return abs && !/%/.test(s) ? Number(abs[1]) : null;
}
