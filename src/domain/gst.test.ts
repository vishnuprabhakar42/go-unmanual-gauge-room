import { describe, expect, it } from "vitest";
import { amountInWordsINR, computeTotals, isInterState } from "./gst";

describe("GST totals", () => {
  it("splits CGST/SGST intra-state and uses IGST inter-state", () => {
    const lines = [
      { rate: 1000, gstPercent: 18 },
      { rate: 450.5, gstPercent: 18 },
    ];
    expect(computeTotals(lines, false)).toEqual({
      subtotal: 1450.5,
      cgst: 130.55,
      sgst: 130.55,
      igst: 0,
      gstAmount: 261.1,
      total: 1711.6,
    });
    expect(computeTotals(lines, true)).toEqual({
      subtotal: 1450.5,
      cgst: 0,
      sgst: 0,
      igst: 261.09,
      gstAmount: 261.09,
      total: 1711.59,
    });
  });
  it("handles quantities and mixed rates", () => {
    expect(
      computeTotals(
        [
          { rate: 100, gstPercent: 12, qty: 3 },
          { rate: 200, gstPercent: 0 },
        ],
        true,
      ).total,
    ).toBe(536);
  });
  it("detects inter-state supply from state codes", () => {
    expect(isInterState("27", "27")).toBe(false);
    expect(isInterState("29", "27")).toBe(true);
    expect(isInterState(null, "27")).toBe(false);
  });
});

describe("amountInWordsINR", () => {
  it("uses lakh and crore", () => {
    expect(amountInWordsINR(125050.5)).toBe("Rupees One Lakh Twenty-Five Thousand Fifty and Fifty Paise Only");
    expect(amountInWordsINR(23456789)).toBe(
      "Rupees Two Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine Only",
    );
    expect(amountInWordsINR(0)).toBe("Rupees Zero Only");
    expect(amountInWordsINR(1711.6)).toBe("Rupees One Thousand Seven Hundred Eleven and Sixty Paise Only");
  });
});
