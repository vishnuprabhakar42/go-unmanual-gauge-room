import { describe, expect, it } from "vitest";
import { assertAuditPackTransition, INDEX_ROWS_PER_PAGE, indexPagesOf, isOverdue, periodError, planLayout } from "./audit-pack";

describe("audit pack status", () => {
  it("queued → running → ready; failed can be retried", () => {
    expect(() => assertAuditPackTransition("QUEUED", "RUNNING")).not.toThrow();
    expect(() => assertAuditPackTransition("RUNNING", "READY")).not.toThrow();
    expect(() => assertAuditPackTransition("FAILED", "QUEUED")).not.toThrow();
    expect(() => assertAuditPackTransition("READY", "RUNNING")).toThrow();
    expect(() => assertAuditPackTransition("QUEUED", "READY")).toThrow();
  });
});

describe("period", () => {
  const d = (s: string) => new Date(`${s}T00:00:00+05:30`);
  it("validates order, future start and length", () => {
    const now = d("2026-10-23");
    expect(periodError(d("2026-04-01"), d("2026-10-23"), now)).toBeNull();
    expect(periodError(d("2026-10-01"), d("2026-04-01"), now)).toMatch(/before/);
    expect(periodError(d("2026-11-01"), d("2026-12-01"), now)).toMatch(/future/);
    expect(periodError(d("2020-01-01"), d("2026-01-01"), now)).toMatch(/3 years/);
  });
});

describe("planLayout", () => {
  it("numbers sections and certificates after the cover and index", () => {
    const l = planLayout(
      [
        { label: "Register", pages: 3 },
        { label: "Overdue", pages: 1 },
      ],
      [
        { label: "VC-01", pages: 2 },
        { label: "VC-02", pages: 1 },
      ],
    );
    expect(l.indexPages).toBe(1);
    expect(l.entries.map((e) => [e.label, e.page])).toEqual([
      ["Register", 3],
      ["Overdue", 6],
      ["Calibration certificates", 7],
      ["VC-01", 7],
      ["VC-02", 9],
    ]);
    expect(l.totalPages).toBe(9);
  });

  it("grows the index for 300 certificates and keeps the totals consistent", () => {
    const certs = Array.from({ length: 300 }, (_, i) => ({ label: `C-${i}`, pages: 1 }));
    const l = planLayout([{ label: "Register", pages: 15 }], certs);
    const rows = 1 + 1 + 300;
    expect(l.indexPages).toBe(Math.ceil(rows / INDEX_ROWS_PER_PAGE));
    expect(l.entries[0].page).toBe(1 + l.indexPages + 1);
    expect(l.totalPages).toBe(1 + l.indexPages + 15 + 300);
    expect(indexPagesOf(l.entries)).toHaveLength(l.indexPages);
  });

  it("works with no certificates", () => {
    const l = planLayout([{ label: "Register", pages: 1 }], []);
    expect(l).toMatchObject({ indexPages: 1, totalPages: 3 });
  });
});

describe("isOverdue", () => {
  const asOf = new Date("2026-10-23T00:00:00+05:30");
  it("counts active instruments past due, including those at a lab", () => {
    expect(isOverdue({ status: "IN_USE", nextDueAt: new Date("2026-10-01") }, asOf)).toBe(true);
    expect(isOverdue({ status: "AT_VENDOR", nextDueAt: new Date("2026-10-01") }, asOf)).toBe(true);
    expect(isOverdue({ status: "SCRAPPED", nextDueAt: new Date("2026-10-01") }, asOf)).toBe(false);
    expect(isOverdue({ status: "IN_USE", nextDueAt: new Date("2026-11-01") }, asOf)).toBe(false);
    expect(isOverdue({ status: "IN_USE", nextDueAt: null }, asOf)).toBe(false);
  });
});
