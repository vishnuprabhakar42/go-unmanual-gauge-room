import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatINR, formatNumberIN } from "./format";

describe("India formatting", () => {
  it("formats dates as DD-MM-YYYY in IST", () => {
    // 2026-03-31 20:00 UTC is already 1 April in IST
    expect(formatDate(new Date("2026-03-31T20:00:00Z"))).toBe("01-04-2026");
    expect(formatDate(new Date("2026-10-22T05:00:00Z"))).toBe("22-10-2026");
    expect(formatDate(null)).toBe("");
    expect(formatDate("not a date")).toBe("");
  });

  it("formats date-time in IST 24h", () => {
    expect(formatDateTime(new Date("2026-10-22T08:35:00Z"))).toBe("22-10-2026 14:05");
  });

  it("formats INR with Indian grouping", () => {
    expect(formatINR(125000)).toBe("₹1,25,000.00");
    expect(formatINR(12345678.5)).toBe("₹1,23,45,678.50");
    expect(formatINR("999")).toBe("₹999.00");
    expect(formatNumberIN(2000000)).toBe("20,00,000");
  });
});
