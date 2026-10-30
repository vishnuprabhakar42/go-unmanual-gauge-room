import { describe, expect, it } from "vitest";
import { computeReading, draftToReading, overallResult, parseReadingsPaste, permissibleFromTolerance as p } from "./readings";

const r = (
  nominal: number,
  asLeft: number,
  permissibleError: number,
  asFound: number | null = null,
  uncertainty: number | null = null,
) => computeReading({ pointLabel: String(nominal), nominal, asLeft, permissibleError, asFound, uncertainty });

describe("readings maths", () => {
  it("computes error and pass/fail with simple acceptance", () => {
    expect(r(25, 25.002, 0.003)).toMatchObject({ error: 0.002, pass: true });
    expect(r(25, 25.004, 0.003)).toMatchObject({ error: 0.004, pass: false });
    expect(r(10, 9.9, 0.1)).toMatchObject({ error: -0.1, pass: true }); // on the limit passes
    expect(r(0.3, 0.1 + 0.2, 0)).toMatchObject({ error: 0, pass: true }); // no float noise
  });
  it("judges as-found separately and flags marginal points", () => {
    expect(r(10, 10.02, 0.05, 10.08)).toMatchObject({ pass: true, asFoundError: 0.08, asFoundPass: false });
    expect(r(10, 10.04, 0.05, null, 0.02)).toMatchObject({ pass: true, marginal: true });
  });
  it("any failing point fails the calibration", () => {
    expect(overallResult([r(0, 0, 0.1), r(5, 5.05, 0.1)])).toEqual({
      result: "PASS",
      failedPoints: 0,
      asFoundFailed: false,
      anyMarginal: false,
    });
    expect(overallResult([r(0, 0, 0.1), r(5, 5.2, 0.1), r(10, 10.11, 0.1)])).toMatchObject({ result: "FAIL", failedPoints: 2 });
    expect(overallResult([r(10, 10.02, 0.05, 10.08)]).asFoundFailed).toBe(true);
    expect(() => overallResult([])).toThrow();
  });
});

describe("readings paste and drafts", () => {
  it("parses 6-column and 4-column rows", () => {
    const { rows, errors } = parseReadingsPaste("2 bar\t2\t2.05\t2.02\t±0.1\t0.03\n4\t4.01\t0.1\t0.03\nbad\t1\n");
    expect(rows).toEqual([
      { pointLabel: "2 bar", nominal: "2", asFound: "2.05", asLeft: "2.02", permissibleError: "0.1", uncertainty: "0.03" },
      { pointLabel: "Point 2", nominal: "4", asFound: "", asLeft: "4.01", permissibleError: "0.1", uncertainty: "0.03" },
    ]);
    expect(errors).toHaveLength(1);
  });
  it("validates drafts", () => {
    expect(
      draftToReading({ pointLabel: "", nominal: "2", asFound: "", asLeft: "2.01", permissibleError: "-0.1", uncertainty: "" }),
    ).toEqual({
      pointLabel: "2",
      nominal: 2,
      asFound: null,
      asLeft: 2.01,
      permissibleError: 0.1,
      uncertainty: null,
    });
    expect(
      draftToReading({ pointLabel: "P1", nominal: "2", asFound: "", asLeft: "", permissibleError: "0.1", uncertainty: "" }),
    ).toMatch(/required/);
    expect(
      draftToReading({ pointLabel: "P1", nominal: "x", asFound: "", asLeft: "1", permissibleError: "0.1", uncertainty: "" }),
    ).toMatch(/required|numbers/);
  });
});

describe("permissibleFromTolerance", () => {
  it("reads absolute and full-scale tolerances", () => {
    expect(p("±0.02 mm", { min: 0, max: 150 })).toBe(0.02);
    expect(p("±2 µm", { min: 0, max: 25 })).toBe(2);
    expect(p("±2.2 °C", { min: 0, max: 1000 })).toBe(2.2);
    expect(p("±1% FS", { min: 0, max: 10 })).toBe(0.1);
    expect(p("±0.5% rdg", { min: 0, max: 10 })).toBeNull();
    expect(p("IT6", { min: null, max: null })).toBeNull();
    expect(p("Grade 1", { min: null, max: null })).toBeNull();
    expect(p(null, { min: 0, max: 1 })).toBeNull();
  });
});
