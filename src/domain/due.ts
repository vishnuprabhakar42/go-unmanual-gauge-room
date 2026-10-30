/**
 * Due engine: next due = last calibration + frequency (calendar arithmetic in IST);
 * "due soon" = within lead days (instrument type's lead time, else org setting).
 */
import { istParts } from "./india/format";

export type FrequencyUnit = "DAYS" | "MONTHS";
export type DueState = "OVERDUE" | "DUE_SOON" | "OK" | "NOT_SCHEDULED";

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Midnight IST of the given calendar day, as a UTC instant. */
export function istMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** Start of the IST calendar day containing `d`. */
export function startOfIstDay(d: Date): Date {
  const p = istParts(d);
  return istMidnight(p.year, p.month, p.day);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds a calibration interval. Month arithmetic clamps to month end (31 Jan + 1 month = 28/29 Feb). */
export function addInterval(from: Date, value: number, unit: FrequencyUnit): Date {
  if (!Number.isInteger(value) || value <= 0) throw new Error("Frequency must be a positive whole number");
  const p = istParts(from);
  if (unit === "DAYS") return new Date(istMidnight(p.year, p.month, p.day).getTime() + value * DAY_MS);
  const total = p.month - 1 + value;
  const year = p.year + Math.floor(total / 12);
  const month = (total % 12) + 1;
  return istMidnight(year, month, Math.min(p.day, daysInMonth(year, month)));
}

export function computeNextDue(lastCalibratedAt: Date | null | undefined, value: number, unit: FrequencyUnit): Date | null {
  return lastCalibratedAt ? addInterval(lastCalibratedAt, value, unit) : null;
}

/** Whole IST calendar days from today until the due date (negative = overdue). */
export function daysUntilDue(nextDueAt: Date, now: Date = new Date()): number {
  return Math.round((startOfIstDay(nextDueAt).getTime() - startOfIstDay(now).getTime()) / DAY_MS);
}

/** Due on the due date itself is still "due soon"; the day after it is overdue. */
export function dueState(nextDueAt: Date | null | undefined, leadDays: number, now: Date = new Date()): DueState {
  if (!nextDueAt) return "NOT_SCHEDULED";
  const days = daysUntilDue(nextDueAt, now);
  if (days < 0) return "OVERDUE";
  if (days <= leadDays) return "DUE_SOON";
  return "OK";
}

/**
 * Same rule from the stored planning date (= next due − lead days): due soon from the planning date until
 * the due date, overdue from the day after.
 */
export function dueStateFromPlanning(
  nextDueAt: Date | null | undefined,
  planningDate: Date | null | undefined,
  now: Date = new Date(),
): DueState {
  if (!nextDueAt) return "NOT_SCHEDULED";
  if (daysUntilDue(nextDueAt, now) < 0) return "OVERDUE";
  if (planningDate && startOfIstDay(planningDate) <= startOfIstDay(now)) return "DUE_SOON";
  return "OK";
}

/** Planning-date bounds for a due filter (planning date is stored and indexed, so one clause covers every lead time). */
export function planningClauses(
  state: DueFilter,
  now: Date = new Date(),
): { nextDueAt?: { gte?: Date; lt?: Date }; planningDate?: { gte?: Date; lt?: Date } } {
  const today = startOfIstDay(now);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  if (state === "OVERDUE") return { nextDueAt: { lt: today } };
  if (state === "DUE_SOON") return { nextDueAt: { gte: today }, planningDate: { lt: tomorrow } };
  if (state === "ACTION") return { planningDate: { lt: tomorrow } };
  return { planningDate: { gte: tomorrow } };
}

export function effectiveLeadDays(typeLeadDays: number | null | undefined, orgDueSoonDays: number): number {
  return typeLeadDays ?? orgDueSoonDays;
}

/** Date-range bounds for list filters, relative to today (IST). */
export function dueStateRange(
  state: Exclude<DueState, "NOT_SCHEDULED">,
  leadDays: number,
  now: Date = new Date(),
): { gte?: Date; lt?: Date } {
  const today = startOfIstDay(now);
  const afterLead = new Date(today.getTime() + (leadDays + 1) * DAY_MS);
  if (state === "OVERDUE") return { lt: today };
  if (state === "DUE_SOON") return { gte: today, lt: afterLead };
  return { gte: afterLead };
}

// ───────── Per-type "due soon" windows (M2) ─────────

export type DueConfig = {
  /** Org default window (settings.dueSoonDays) */
  orgDays: number;
  /** Instrument types with their own lead time */
  typeLeads: readonly { typeId: string; lead: number }[];
};

/** Overdue, or due within the window — the "needs action" set used by the due list and digest. */
export type DueFilter = Exclude<DueState, "NOT_SCHEDULED"> | "ACTION";

export type DueClause = {
  /** undefined = all types; in = only these; notIn = all except these */
  types?: { in: string[] } | { notIn: string[] };
  range: { gte?: Date; lt?: Date };
};

/**
 * Translates a due filter into OR-able clauses, one per distinct lead time, so per-type windows are
 * honoured in a single indexed query. Overdue doesn't depend on the window.
 */
export function dueClauses(state: DueFilter, cfg: DueConfig, now: Date = new Date()): DueClause[] {
  if (state === "OVERDUE") return [{ range: dueStateRange("OVERDUE", cfg.orgDays, now) }];
  const byLead = new Map<number, string[]>();
  for (const t of cfg.typeLeads) if (t.lead !== cfg.orgDays) byLead.set(t.lead, [...(byLead.get(t.lead) ?? []), t.typeId]);
  const custom = [...byLead.values()].flat();
  const rangeFor = (lead: number) =>
    state === "ACTION" ? { lt: dueStateRange("DUE_SOON", lead, now).lt } : dueStateRange(state, lead, now);
  const clauses: DueClause[] = [{ types: custom.length ? { notIn: custom } : undefined, range: rangeFor(cfg.orgDays) }];
  for (const [lead, ids] of byLead) clauses.push({ types: { in: ids }, range: rangeFor(lead) });
  return clauses.map((c) => (c.types === undefined ? { range: c.range } : c));
}

// ───────── Months & aging ─────────

/** "2026-11" for the IST calendar month of `d`. */
export function monthKey(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function isMonthKey(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** IST month bounds for a "YYYY-MM" key. */
export function monthRange(key: string): { gte: Date; lt: Date } {
  const [y, m] = key.split("-").map(Number);
  return { gte: istMidnight(y, m, 1), lt: m === 12 ? istMidnight(y + 1, 1, 1) : istMidnight(y, m + 1, 1) };
}

/** The current month and the next n−1 months as keys. */
export function upcomingMonths(n: number, now: Date = new Date()): string[] {
  const p = istParts(now);
  return Array.from({ length: n }, (_, i) => {
    const idx = p.month - 1 + i;
    return `${p.year + Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

export const AGING_BUCKETS = ["0-15", "16-30", "30+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Days at vendor → bucket (0–15, 16–30, more than 30). */
export function agingBucket(days: number): AgingBucket {
  if (days <= 15) return "0-15";
  if (days <= 30) return "16-30";
  return "30+";
}

/** Whole IST days elapsed since `since`. */
export function daysSince(since: Date, now: Date = new Date()): number {
  return -daysUntilDue(since, now);
}
