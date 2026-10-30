import { describe, expect, it } from "vitest";
import { gstinCheckChar, gstinPan, gstinStateCode, isValidGstin, validateGstin } from "./gstin";

describe("GSTIN", () => {
  it("accepts valid GSTINs (checksum verified)", () => {
    for (const g of ["27AAPFU0939F1ZV", "27AADCD4321K1ZR", "33AADCD4321K2ZX", "06AAACE1122B1ZN"]) {
      expect(isValidGstin(g)).toBe(true);
    }
  });

  it("normalises case and whitespace", () => {
    expect(isValidGstin("  27aapfu0939f1zv ")).toBe(true);
  });

  it("rejects a wrong check character", () => {
    expect(validateGstin("27AAPFU0939F1ZA")).toEqual({ valid: false, reason: "GSTIN checksum does not match" });
  });

  it("rejects bad length, format and state code", () => {
    expect(validateGstin("27AAPFU0939F1Z")).toMatchObject({ valid: false, reason: "GSTIN must be 15 characters" });
    expect(validateGstin("27AAPFU0939F1XV")).toMatchObject({ valid: false, reason: "GSTIN format is invalid" });
    expect(validateGstin("27AAPF10939F1ZV")).toMatchObject({ valid: false, reason: "GSTIN format is invalid" });
    const bad = "45AAPFU0939F1Z";
    expect(validateGstin(bad + gstinCheckChar(bad))).toMatchObject({ valid: false, reason: "Unknown state code" });
  });

  it("extracts state code and PAN", () => {
    expect(gstinStateCode("27AAPFU0939F1ZV")).toBe("27");
    expect(gstinPan("27AAPFU0939F1ZV")).toBe("AAPFU0939F");
  });
});
