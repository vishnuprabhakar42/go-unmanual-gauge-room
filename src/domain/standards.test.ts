import { describe, expect, it } from "vitest";
import { effectiveStandard } from "./standards";

describe("effectiveStandard", () => {
  const type = { standardCode: "IS 3651 (Part 1)", standardDate: new Date("2009-01-01") };
  it("inherits the type's standard unless the instrument overrides it", () => {
    expect(effectiveStandard({ standardCode: null, standardDate: null, type })).toEqual({ ...type, inherited: true });
    expect(effectiveStandard({ standardCode: "ISO 13385-1", standardDate: new Date("2019-01-01"), type })).toEqual({
      standardCode: "ISO 13385-1",
      standardDate: new Date("2019-01-01"),
      inherited: false,
    });
    expect(
      effectiveStandard({ standardCode: null, standardDate: null, type: { standardCode: null, standardDate: null } }).inherited,
    ).toBe(false);
  });
});
