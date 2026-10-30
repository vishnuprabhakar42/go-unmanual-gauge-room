/** Normalisers for messy cell values (numbers, ranges, frequencies, enums, booleans). */
export type FrequencyParse = { value: number; unit: "DAYS" | "MONTHS" };

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text ?? "").trim();
  if (typeof v === "object" && v !== null && "result" in v) return cellText((v as { result: unknown }).result);
  return String(v).trim();
}

/** "1,250.50", "₹ 12,500", "0.01mm" → number. */
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = cellText(v).replace(/[₹,\s]|rs\.?|inr/gi, "");
  if (!s || s === "-") return null;
  const m = s.match(/^[+-]?\d*\.?\d+(e[+-]?\d+)?/i);
  return m ? Number(m[0]) : null;
}

/** "0-150 mm", "0 – 25mm", "-50 to 200 °C", "0~10 bar" → { min, max, unit } */
export function parseRange(v: unknown): { min: number; max: number; unit: string | null } | null {
  const s = cellText(v).replace(/\s+/g, " ");
  const m = s.match(/^(-?\d*\.?\d+)\s*(?:-|–|—|~|to)\s*(-?\d*\.?\d+)\s*(.*)$/i);
  if (!m) return null;
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  return { min, max, unit: m[3].trim() || null };
}

/** "±0.02", "+/- 0.02 mm", "0.02" → 0.02 (symmetric tolerance magnitude) */
export function parseTolerance(v: unknown): number | null {
  const s = cellText(v).replace(/±|\+\/-|\+-/g, "");
  const n = parseNumber(s);
  return n === null ? null : Math.abs(n);
}

const WORD_FREQ: Record<string, FrequencyParse> = {
  yearly: { value: 12, unit: "MONTHS" },
  annual: { value: 12, unit: "MONTHS" },
  annually: { value: 12, unit: "MONTHS" },
  "half yearly": { value: 6, unit: "MONTHS" },
  "half-yearly": { value: 6, unit: "MONTHS" },
  halfyearly: { value: 6, unit: "MONTHS" },
  "six monthly": { value: 6, unit: "MONTHS" },
  quarterly: { value: 3, unit: "MONTHS" },
  monthly: { value: 1, unit: "MONTHS" },
  weekly: { value: 7, unit: "DAYS" },
  "2 yearly": { value: 24, unit: "MONTHS" },
  biennial: { value: 24, unit: "MONTHS" },
};

/** "12", "12 M", "12 months", "1 year", "2 yrs", "180 days", "Yearly", "6M" → interval. Bare numbers are months. */
export function parseFrequency(v: unknown, defaultUnit: "DAYS" | "MONTHS" = "MONTHS"): FrequencyParse | null {
  const s = cellText(v).toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (WORD_FREQ[s]) return WORD_FREQ[s];
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([a-z.]*)$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].replace(/\./g, "");
  if (!(n > 0)) return null;
  if (unit === "") return Number.isInteger(n) ? { value: n, unit: defaultUnit } : null;
  if (/^(d|day|days)$/.test(unit)) return Number.isInteger(n) ? { value: n, unit: "DAYS" } : null;
  if (/^(w|wk|wks|week|weeks)$/.test(unit)) return Number.isInteger(n) ? { value: n * 7, unit: "DAYS" } : null;
  if (/^(m|mo|mon|mons|month|months|mth|mths)$/.test(unit)) return Number.isInteger(n) ? { value: n, unit: "MONTHS" } : null;
  if (/^(y|yr|yrs|year|years)$/.test(unit)) return Number.isInteger(n * 12) ? { value: n * 12, unit: "MONTHS" } : null;
  return null;
}

export function parseBoolean(v: unknown): boolean | null {
  const s = cellText(v).toLowerCase();
  if (!s) return null;
  if (["y", "yes", "true", "1", "nabl", "required"].includes(s)) return true;
  if (["n", "no", "false", "0", "not required", "na", "n/a"].includes(s)) return false;
  return null;
}

export function parseCriticality(v: unknown): "A" | "B" | "C" | null {
  const s = cellText(v).toUpperCase();
  if (!s) return null;
  if (["A", "HIGH", "CRITICAL", "H", "1"].includes(s)) return "A";
  if (["B", "MEDIUM", "MED", "M", "2"].includes(s)) return "B";
  if (["C", "LOW", "L", "3"].includes(s)) return "C";
  return null;
}

export function parseSource(v: unknown): "EXTERNAL" | "INHOUSE" | null {
  const s = cellText(v).toLowerCase().replace(/[\s-]/g, "");
  if (!s) return null;
  if (["external", "outside", "vendor", "ext", "lab", "nabllab", "outsource"].includes(s)) return "EXTERNAL";
  if (["inhouse", "internal", "int", "ih", "self"].includes(s)) return "INHOUSE";
  return null;
}

/** "Adjustable" / "Non-adjustable" / Y / N → boolean. */
export function parseAdjustable(v: unknown): boolean | null {
  const s = cellText(v)
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
  if (!s) return null;
  if (["adjustable", "adj", "y", "yes", "true", "1"].includes(s)) return true;
  if (["non adjustable", "nonadjustable", "not adjustable", "fixed", "non adj", "n", "no", "false", "0"].includes(s))
    return false;
  return null;
}
