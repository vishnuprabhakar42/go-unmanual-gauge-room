/**
 * Instrument import validation (pure). Turns mapped spreadsheet rows into normalized instruments plus a
 * row-level error report. Used for both the dry run and the real import, so they always agree.
 */
import { computeNextDue, daysUntilDue, type FrequencyUnit } from "../due";
import { parseFlexibleDate } from "./dates";
import type { ImportFieldKey } from "./fields";
import type { ColumnMapping } from "./mapping";
import {
  parseAdjustable,
  cellText,
  parseBoolean,
  parseCriticality,
  parseFrequency,
  parseNumber,
  parseRange,
  parseSource,
  parseTolerance,
} from "./values";

export type RawCell = string | number | null;

export type ImportTypeInfo = {
  name: string;
  defaultFrequencyValue: number;
  defaultFrequencyUnit: FrequencyUnit;
  nablRequired: boolean;
  unit: string | null;
};

export type ImportOptions = { createMissingTypes: boolean; updateExisting: boolean };

export type ImportContext = {
  /** Plant used when the sheet has no plant column (or the cell is blank) */
  defaultPlantCode: string;
  plantCodes: ReadonlySet<string>;
  /** keyed by normalizeKey(type name) */
  types: ReadonlyMap<string, ImportTypeInfo>;
  /** keyed by normalizeKey(code) */
  existingCodes: ReadonlySet<string>;
  /** keyed by scopedKey(plantCode, name) — anything else will be created */
  departments: ReadonlySet<string>;
  locations: ReadonlySet<string>;
  options: ImportOptions;
  now: Date;
};

export const IMPORTABLE_STATUSES = ["IN_STORE", "IN_USE", "SCRAPPED", "LOST"] as const;
export type ImportableStatus = (typeof IMPORTABLE_STATUSES)[number];

export type NormalizedInstrument = {
  code: string;
  typeName: string;
  description: string | null;
  make: string | null;
  model: string | null;
  serialNo: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  unit: string | null;
  leastCount: number | null;
  tolerancePlus: number | null;
  toleranceMinus: number | null;
  acceptanceCriteria: string | null;
  plantCode: string;
  department: string | null;
  location: string | null;
  custodianName: string | null;
  criticality: "A" | "B" | "C";
  calibrationSource: "EXTERNAL" | "INHOUSE";
  frequencyValue: number;
  frequencyUnit: FrequencyUnit;
  lastCalibratedAt: Date | null;
  nextDueAt: Date | null;
  nablRequired: boolean;
  purchaseValue: number | null;
  status: ImportableStatus;
  notes: string | null;
  /** undefined = column not mapped (an update import leaves the field unchanged) */
  standardCode?: string | null;
  standardDate?: Date | null;
  adjustable?: boolean | null;
};

export type RowIssue = { field: ImportFieldKey | "row"; message: string };

export type ImportRowResult = {
  /** 1-based spreadsheet row number */
  row: number;
  code: string;
  action: "create" | "update" | "error";
  errors: RowIssue[];
  warnings: RowIssue[];
  data?: NormalizedInstrument;
};

export type ImportSummary = {
  total: number;
  create: number;
  update: number;
  errors: number;
  withWarnings: number;
  missingTypes: string[];
  newDepartments: string[];
  newLocations: string[];
};

export function normalizeKey(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Key for plant-scoped masters (departments, locations). */
export function scopedKey(plantCode: string, name: string): string {
  return `${normalizeKey(plantCode)}|${normalizeKey(name)}`;
}

const STATUS_WORDS: Record<string, ImportableStatus> = {
  "IN STORE": "IN_STORE",
  STORE: "IN_STORE",
  IN_STORE: "IN_STORE",
  AVAILABLE: "IN_STORE",
  ACTIVE: "IN_USE",
  "IN USE": "IN_USE",
  IN_USE: "IN_USE",
  USE: "IN_USE",
  ISSUED: "IN_USE",
  SCRAPPED: "SCRAPPED",
  SCRAP: "SCRAPPED",
  DISCARDED: "SCRAPPED",
  LOST: "LOST",
  MISSING: "LOST",
};

function text(row: readonly RawCell[], mapping: ColumnMapping, key: ImportFieldKey): string {
  const col = mapping[key];
  return col === undefined ? "" : cellText(row[col]);
}

function raw(row: readonly RawCell[], mapping: ColumnMapping, key: ImportFieldKey): RawCell {
  const col = mapping[key];
  return col === undefined ? null : (row[col] ?? null);
}

const orNull = (s: string) => (s === "" ? null : s);

export function validateRow(
  row: readonly RawCell[],
  rowNumber: number,
  mapping: ColumnMapping,
  ctx: ImportContext,
  seenCodes: Map<string, number>,
): ImportRowResult {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const code = text(row, mapping, "code");
  const typeName = text(row, mapping, "type");

  if (!code) errors.push({ field: "code", message: "Instrument code is missing" });
  else if (code.length > 50) errors.push({ field: "code", message: "Code is longer than 50 characters" });
  const codeKey = normalizeKey(code);
  let action: ImportRowResult["action"] = "create";
  if (code) {
    const firstRow = seenCodes.get(codeKey);
    if (firstRow !== undefined) errors.push({ field: "code", message: `Duplicate code — also on row ${firstRow}` });
    else seenCodes.set(codeKey, rowNumber);
    if (ctx.existingCodes.has(codeKey)) {
      if (ctx.options.updateExisting) action = "update";
      else errors.push({ field: "code", message: "Code already exists (choose “update existing” to overwrite)" });
    }
  }

  let type: ImportTypeInfo | undefined;
  if (!typeName) errors.push({ field: "type", message: "Instrument type is missing" });
  else {
    type = ctx.types.get(normalizeKey(typeName));
    if (!type && !ctx.options.createMissingTypes) {
      errors.push({ field: "type", message: `Unknown type “${typeName}” (choose “create missing types”)` });
    }
  }

  const plantCode = normalizeKey(text(row, mapping, "plant") || ctx.defaultPlantCode);
  if (!ctx.plantCodes.has(plantCode)) errors.push({ field: "plant", message: `Unknown plant “${plantCode}”` });

  // Frequency: sheet → type default → 12 months
  let frequencyValue = type?.defaultFrequencyValue ?? 12;
  let frequencyUnit: FrequencyUnit = type?.defaultFrequencyUnit ?? "MONTHS";
  const freqText = text(row, mapping, "frequency");
  if (freqText) {
    const f = parseFrequency(freqText);
    if (f) {
      frequencyValue = f.value;
      frequencyUnit = f.unit;
    } else errors.push({ field: "frequency", message: `Can't read frequency “${freqText}” (try “12 months” or “180 days”)` });
  } else if (mapping.frequency !== undefined) {
    warnings.push({ field: "frequency", message: `No frequency — using ${frequencyValue} ${frequencyUnit.toLowerCase()}` });
  }

  const dateField = (key: "lastCalibratedAt" | "nextDueAt" | "standardDate"): Date | null => {
    const parsed = parseFlexibleDate(raw(row, mapping, key));
    if (!parsed) return null;
    if (!parsed.ok) {
      errors.push({ field: key, message: parsed.error });
      return null;
    }
    if (parsed.note) warnings.push({ field: key, message: parsed.note });
    return parsed.date;
  };
  const lastCalibratedAt = dateField("lastCalibratedAt");
  const sheetNextDue = dateField("nextDueAt");
  if (lastCalibratedAt && daysUntilDue(lastCalibratedAt, ctx.now) > 0) {
    errors.push({ field: "lastCalibratedAt", message: "Last calibration date is in the future" });
  }
  let nextDueAt = sheetNextDue;
  if (lastCalibratedAt) {
    nextDueAt = computeNextDue(lastCalibratedAt, frequencyValue, frequencyUnit);
    if (sheetNextDue && nextDueAt && Math.abs(daysUntilDue(sheetNextDue, nextDueAt)) > 1) {
      warnings.push({
        field: "nextDueAt",
        message: "Sheet's due date differs from last calibration + frequency; using the calculated date",
      });
    }
  } else if (!sheetNextDue) {
    warnings.push({ field: "lastCalibratedAt", message: "No calibration dates — instrument will be unscheduled" });
  }

  // Range: combined column or min/max
  let rangeMin: number | null = null;
  let rangeMax: number | null = null;
  let unit = orNull(text(row, mapping, "unit"));
  const rangeText = text(row, mapping, "range");
  if (rangeText) {
    const r = parseRange(rangeText);
    if (r) {
      rangeMin = r.min;
      rangeMax = r.max;
      unit ??= r.unit;
    } else warnings.push({ field: "range", message: `Couldn't split range “${rangeText}”; kept in description` });
  } else {
    rangeMin = parseNumber(raw(row, mapping, "rangeMin"));
    rangeMax = parseNumber(raw(row, mapping, "rangeMax"));
    if (rangeMin !== null && rangeMax !== null && rangeMax < rangeMin) {
      errors.push({ field: "rangeMax", message: "Range max is smaller than range min" });
    }
  }
  unit ??= type?.unit ?? null;

  const enumField = <T>(key: ImportFieldKey, parse: (v: string) => T | null, fallback: T, label: string): T => {
    const t = text(row, mapping, key);
    if (!t) return fallback;
    const v = parse(t);
    if (v === null) {
      warnings.push({ field: key, message: `Unrecognised ${label} “${t}” — using default` });
      return fallback;
    }
    return v;
  };

  const tolerance = parseTolerance(raw(row, mapping, "tolerance"));
  let description = orNull(text(row, mapping, "description"));
  if (rangeText && rangeMin === null) description = [description, rangeText].filter(Boolean).join(" · ");

  const purchaseValueText = text(row, mapping, "purchaseValue");
  const purchaseValue = parseNumber(purchaseValueText);
  if (purchaseValueText && purchaseValue === null)
    warnings.push({ field: "purchaseValue", message: `Unrecognised value “${purchaseValueText}”` });

  const mapped = (k: ImportFieldKey) => mapping[k] !== undefined;
  const standardDate = mapped("standardDate") ? dateField("standardDate") : undefined;
  let adjustable: boolean | null | undefined;
  if (mapped("adjustable")) {
    const a = text(row, mapping, "adjustable");
    adjustable = a ? parseAdjustable(a) : null;
    if (a && adjustable === null)
      warnings.push({ field: "adjustable", message: `Unrecognised value “${a}” (use Adjustable / Non-adjustable)` });
  }

  const department = orNull(text(row, mapping, "department"));
  const location = orNull(text(row, mapping, "location"));

  const result: ImportRowResult = { row: rowNumber, code, action: errors.length ? "error" : action, errors, warnings };
  if (errors.length) return result;

  result.data = {
    code,
    typeName: type?.name ?? typeName.trim(),
    description,
    make: orNull(text(row, mapping, "make")),
    model: orNull(text(row, mapping, "model")),
    serialNo: orNull(text(row, mapping, "serialNo")),
    rangeMin,
    rangeMax,
    unit,
    leastCount: parseNumber(raw(row, mapping, "leastCount")),
    tolerancePlus: tolerance,
    toleranceMinus: tolerance,
    acceptanceCriteria: orNull(text(row, mapping, "acceptanceCriteria")),
    plantCode,
    department,
    location,
    custodianName: orNull(text(row, mapping, "custodianName")),
    criticality: enumField("criticality", parseCriticality, "B" as const, "criticality"),
    calibrationSource: enumField("calibrationSource", parseSource, "EXTERNAL" as const, "calibration source"),
    frequencyValue,
    frequencyUnit,
    lastCalibratedAt,
    nextDueAt,
    nablRequired: enumField("nablRequired", parseBoolean, type?.nablRequired ?? true, "NABL flag"),
    purchaseValue,
    status: enumField("status", (s) => STATUS_WORDS[normalizeKey(s)] ?? null, "IN_STORE" as ImportableStatus, "status"),
    notes: orNull(text(row, mapping, "notes")),
    standardCode: mapped("standardCode") ? orNull(text(row, mapping, "standardCode")) : undefined,
    standardDate,
    adjustable,
  };
  return result;
}

/** Skips fully blank rows; `firstDataRow` is the 1-based sheet row of rows[0]. */
export function validateRows(
  rows: readonly (readonly RawCell[])[],
  mapping: ColumnMapping,
  ctx: ImportContext,
  firstDataRow = 2,
): { results: ImportRowResult[]; summary: ImportSummary } {
  const seen = new Map<string, number>();
  const results: ImportRowResult[] = [];
  rows.forEach((row, i) => {
    if (row.every((c) => cellText(c) === "")) return;
    results.push(validateRow(row, firstDataRow + i, mapping, ctx, seen));
  });

  const missingTypes = new Map<string, string>();
  const newDepartments = new Map<string, string>();
  const newLocations = new Map<string, string>();
  for (const r of results) {
    if (!r.data) continue;
    const tk = normalizeKey(r.data.typeName);
    if (!ctx.types.has(tk)) missingTypes.set(tk, r.data.typeName);
    const { plantCode, department, location } = r.data;
    if (department && !ctx.departments.has(scopedKey(plantCode, department))) {
      newDepartments.set(scopedKey(plantCode, department), `${plantCode} · ${department}`);
    }
    if (location && !ctx.locations.has(scopedKey(plantCode, location))) {
      newLocations.set(scopedKey(plantCode, location), `${plantCode} · ${location}`);
    }
  }

  return {
    results,
    summary: {
      total: results.length,
      create: results.filter((r) => r.action === "create").length,
      update: results.filter((r) => r.action === "update").length,
      errors: results.filter((r) => r.action === "error").length,
      withWarnings: results.filter((r) => r.warnings.length > 0).length,
      missingTypes: [...missingTypes.values()],
      newDepartments: [...newDepartments.values()],
      newLocations: [...newLocations.values()],
    },
  };
}
