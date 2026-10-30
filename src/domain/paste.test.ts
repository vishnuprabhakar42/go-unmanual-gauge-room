import { describe, expect, it } from "vitest";
import { parsePastedGrid } from "./paste";

describe("parsePastedGrid", () => {
  it("parses rows and columns copied from Excel", () => {
    expect(parsePastedGrid("₹1,250\t18%\t7 days\r\n900\t18\t5\n\n")).toEqual([
      ["1250", "18", "7"],
      ["900", "18", "5"],
    ]);
    expect(parsePastedGrid("450")).toEqual([["450"]]);
  });
});
