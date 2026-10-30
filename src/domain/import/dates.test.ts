import { describe, expect, it } from "vitest";
import { formatDate } from "../india/format";
import { parseFlexibleDate } from "./dates";

const ok = (v: unknown) => {
  const r = parseFlexibleDate(v);
  if (!r || !r.ok) throw new Error(`expected ok for ${String(v)}: ${JSON.stringify(r)}`);
  return formatDate(r.date);
};

describe("parseFlexibleDate", () => {
  it("parses Indian day-first formats", () => {
    expect(ok("15-03-2025")).toBe("15-03-2025");
    expect(ok("15/03/2025")).toBe("15-03-2025");
    expect(ok("15.03.2025")).toBe("15-03-2025");
    expect(ok("5/3/25")).toBe("05-03-2025");
    expect(ok("01/04/99")).toBe("01-04-1999");
  });

  it("parses ISO, month names and Excel serials", () => {
    expect(ok("2025-03-15")).toBe("15-03-2025");
    expect(ok("2025-03-15T00:00:00.000Z")).toBe("15-03-2025");
    expect(ok("15-Mar-2025")).toBe("15-03-2025");
    expect(ok("15 March 25")).toBe("15-03-2025");
    expect(ok("Mar 15, 2025")).toBe("15-03-2025");
    expect(ok(45731)).toBe("15-03-2025");
    expect(ok("45731")).toBe("15-03-2025");
    expect(ok(new Date(Date.UTC(2025, 2, 15)))).toBe("15-03-2025");
  });

  it("reads obvious US dates month-first with a note", () => {
    const r = parseFlexibleDate("03/25/2025");
    expect(r && r.ok && formatDate(r.date)).toBe("25-03-2025");
    expect(r && r.ok && r.note).toMatch(/month-first/);
  });

  it("treats blanks as empty and rejects garbage", () => {
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate(null)).toBeNull();
    expect(parseFlexibleDate("NA")).toBeNull();
    expect(parseFlexibleDate("31-02-2025")).toMatchObject({ ok: false });
    expect(parseFlexibleDate("next month")).toMatchObject({ ok: false });
    expect(parseFlexibleDate(12)).toMatchObject({ ok: false });
  });
});
