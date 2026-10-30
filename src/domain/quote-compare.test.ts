import { describe, expect, it } from "vitest";
import { compareOffers, type Offer } from "./quote-compare";

const o = (vendorId: string, rate: number, extra: Partial<Offer> = {}): Offer => ({
  quoteId: `q-${vendorId}`,
  quoteItemId: `qi-${vendorId}`,
  vendorId,
  vendorName: vendorId,
  rate,
  gstPercent: 18,
  tatDays: 7,
  nablInScope: true,
  techStatus: "TECH_APPROVED",
  awarded: false,
  ...extra,
});

describe("compareOffers", () => {
  it("recommends the lowest landed cost among approved, in-scope offers", () => {
    const res = compareOffers([
      o("a", 500),
      o("b", 400, { techStatus: "TECH_REJECTED" }),
      o("c", 450, { nablInScope: false }),
      o("d", 480, { gstPercent: 12 }),
    ]);
    expect(res.map((r) => [r.vendorId, r.landed, r.recommended])).toEqual([
      ["b", 472, false],
      ["c", 531, false],
      ["d", 537.6, true],
      ["a", 590, false],
    ]);
  });
  it("breaks ties on TAT and recommends none when nobody is eligible", () => {
    expect(compareOffers([o("a", 500, { tatDays: 9 }), o("b", 500, { tatDays: 4 })]).find((r) => r.recommended)?.vendorId).toBe(
      "b",
    );
    expect(compareOffers([o("a", 500, { techStatus: "SUBMITTED" })]).some((r) => r.recommended)).toBe(false);
  });
});
