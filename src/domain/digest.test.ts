import { describe, expect, it } from "vitest";
import { digestFor, digestRecipients, isEmptyDigest, type DigestInstrument, type DigestMember } from "./digest";

const m = (userId: string, role: DigestMember["role"], plantId: string | null): DigestMember => ({
  userId,
  name: userId,
  email: `${userId}@x.test`,
  phone: null,
  role,
  plantId,
});
const inst = (code: string, plantId: string, days: number): DigestInstrument => ({
  code,
  type: "Vernier",
  plantId,
  plantCode: plantId.toUpperCase(),
  days,
});

describe("digest recipients", () => {
  it("gauge in-charges per plant, quality head everywhere with escalations", () => {
    const r = digestRecipients([
      m("g1", "GAUGE_INCHARGE", "p1"),
      m("g2", "GAUGE_INCHARGE", "p2"),
      m("qh", "QUALITY_HEAD", null),
      m("admin", "ORG_ADMIN", null),
      m("op", "OPERATOR", "p1"),
    ]);
    expect(r.map((x) => [x.userId, x.plantIds, x.escalations])).toEqual([
      ["g1", ["p1"], false],
      ["g2", ["p2"], false],
      ["qh", null, true],
    ]);
  });
  it("merges roles for the same user and falls back to admins without a quality head", () => {
    const r = digestRecipients([m("u", "GAUGE_INCHARGE", "p1"), m("u", "GAUGE_INCHARGE", "p2"), m("admin", "ORG_ADMIN", null)]);
    expect(r).toEqual([
      expect.objectContaining({ userId: "u", plantIds: ["p1", "p2"], escalations: false }),
      expect.objectContaining({ userId: "admin", plantIds: null, escalations: true }),
    ]);
  });
});

describe("digestFor", () => {
  const data = {
    overdue: [inst("A", "p1", -3), inst("B", "p1", -10), inst("C", "p2", -20)],
    dueThisWeek: [inst("D", "p1", 5), inst("E", "p2", 1)],
    returnsOverdue: [{ ...inst("F", "p2", 90), atVendorDays: 40 }],
  };
  it("scopes to the recipient's plants, sorted most urgent first", () => {
    const c = digestFor({ userId: "g", name: "g", email: "", phone: null, plantIds: ["p1"], escalations: false }, data);
    expect(c.overdue.map((i) => i.code)).toEqual(["B", "A"]);
    expect(c.dueThisWeek.map((i) => i.code)).toEqual(["D"]);
    expect(c.returnsOverdue).toEqual([]);
    expect(c.escalated).toEqual([]);
  });
  it("escalates items overdue by more than 7 days to the quality head", () => {
    const c = digestFor({ userId: "q", name: "q", email: "", phone: null, plantIds: null, escalations: true }, data);
    expect(c.escalated.map((i) => i.code)).toEqual(["C", "B"]);
    expect(isEmptyDigest(c)).toBe(false);
  });
  it("detects empty digests", () => {
    expect(
      isEmptyDigest(digestFor({ userId: "z", name: "", email: "", phone: null, plantIds: ["p9"], escalations: true }, data)),
    ).toBe(true);
  });
});
