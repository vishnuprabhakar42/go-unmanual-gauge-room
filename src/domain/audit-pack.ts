/**
 * Audit pack (IATF 16949 / ISO 9001 cl. 7.1.5 evidence): status machine, period rules and page layout.
 * The pack is: cover → index → report sections → certificates. The index has a fixed number of rows per
 * page, so its page count (and therefore every start page) is known before anything is rendered.
 */
export const AUDIT_PACK_STATUSES = ["QUEUED", "RUNNING", "READY", "FAILED"] as const;
export type AuditPackStatus = (typeof AUDIT_PACK_STATUSES)[number];

export const AUDIT_PACK_TRANSITIONS: Readonly<Record<AuditPackStatus, readonly AuditPackStatus[]>> = {
  QUEUED: ["RUNNING", "FAILED"],
  RUNNING: ["READY", "FAILED"],
  READY: [],
  FAILED: ["QUEUED"], // retry
};

export function assertAuditPackTransition(from: AuditPackStatus, to: AuditPackStatus) {
  if (!AUDIT_PACK_TRANSITIONS[from].includes(to)) throw new Error(`Audit pack can't go from ${from} to ${to}`);
}

export const MAX_PERIOD_DAYS = 3 * 366;

/** Period checks (dates are IST midnights; `to` is inclusive). Returns an error message or null. */
export function periodError(from: Date, to: Date, now = new Date()): string | null {
  if (to < from) return "The end date is before the start date";
  if (from > now) return "The period can't start in the future";
  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_PERIOD_DAYS) return "Choose a period of up to 3 years";
  return null;
}

export const SECTION_KEYS = ["register", "overdue", "calibrations", "oot", "vendors"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const INDEX_ROWS_PER_PAGE = 40;
export const COVER_PAGES = 1;

export type IndexEntry = { kind: "section" | "appendix" | "certificate"; label: string; detail?: string; page: number };
export type PackLayout = { indexPages: number; entries: IndexEntry[]; totalPages: number };

/**
 * Start page of every section and certificate (1-based, counting the cover and index).
 * `sections` and `certificates` carry their own page counts in final order.
 */
export function planLayout(
  sections: readonly { label: string; pages: number }[],
  certificates: readonly { label: string; detail?: string; pages: number }[],
): PackLayout {
  const rows = sections.length + (certificates.length ? 1 + certificates.length : 0);
  const indexPages = Math.max(1, Math.ceil(rows / INDEX_ROWS_PER_PAGE));
  let page = COVER_PAGES + indexPages + 1;
  const entries: IndexEntry[] = [];
  for (const s of sections) {
    entries.push({ kind: "section", label: s.label, page });
    page += s.pages;
  }
  if (certificates.length) {
    entries.push({ kind: "appendix", label: "Calibration certificates", page });
    for (const c of certificates) {
      entries.push({ kind: "certificate", label: c.label, detail: c.detail, page });
      page += c.pages;
    }
  }
  return { indexPages, entries, totalPages: page - 1 };
}

/** Index rows split into pages of exactly INDEX_ROWS_PER_PAGE (last page may be shorter). */
export function indexPagesOf(entries: readonly IndexEntry[]): IndexEntry[][] {
  const out: IndexEntry[][] = [];
  for (let i = 0; i < entries.length; i += INDEX_ROWS_PER_PAGE) out.push(entries.slice(i, i + INDEX_ROWS_PER_PAGE));
  return out.length ? out : [[]];
}

/** Instruments that count as overdue at `asOf`: active and past their due date (out at a lab still counts). */
export function isOverdue(i: { status: string; nextDueAt: Date | null }, asOf: Date): boolean {
  if (["SCRAPPED", "LOST"].includes(i.status)) return false;
  return !!i.nextDueAt && i.nextDueAt < asOf;
}
