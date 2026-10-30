import { describe, expect, it } from "vitest";
import { isValidPan } from "./pan";

describe("PAN", () => {
  it("accepts valid PANs", () => {
    expect(isValidPan("AADCD4321K")).toBe(true);
    expect(isValidPan("abcpe1234f")).toBe(true);
  });
  it("rejects invalid PANs", () => {
    expect(isValidPan("AADCD4321")).toBe(false);
    expect(isValidPan("AADXD4321K")).toBe(false); // 4th char must be a holder type
    expect(isValidPan("1ADCD4321K")).toBe(false);
  });
});
