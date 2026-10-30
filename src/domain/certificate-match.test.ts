import { describe, expect, it } from "vitest";
import { identifierPattern, matchCertificateFiles, type MatchCandidate } from "./certificate-match";

const jobs: MatchCandidate[] = Array.from({ length: 20 }, (_, i) => ({
  jobId: `job-${i + 1}`,
  code: `C-VC-${String(i + 1).padStart(3, "0")}`,
  serialNo: `VC48${String(1000 + i)}`,
}));

describe("certificate file matching", () => {
  it("acceptance: 20 PDFs named with instrument codes auto-attach to the right jobs", () => {
    const names = jobs.map((j, i) =>
      i % 4 === 0
        ? `${j.code}.pdf`
        : i % 4 === 1
          ? `Cert_${j.code.replace(/-/g, "_")}_rev0.PDF`
          : i % 4 === 2
            ? `${j.code.replace(/-/g, " ")} calibration.pdf`
            : `PCL-2026-${j.code}.pdf`,
    );
    const res = matchCertificateFiles(names, jobs);
    expect(res.every((r) => r.status === "matched")).toBe(true);
    expect(res.map((r) => (r.status === "matched" ? r.jobId : null))).toEqual(jobs.map((j) => j.jobId));
  });

  it("respects digit boundaries (VC-1 is not VC-10)", () => {
    const res = matchCertificateFiles(
      ["VC-10.pdf", "VC-1.pdf"],
      [
        { jobId: "a", code: "VC-1", serialNo: null },
        { jobId: "b", code: "VC-10", serialNo: null },
      ],
    );
    expect(res).toEqual([
      { fileName: "VC-10.pdf", status: "matched", jobId: "b", by: "code" },
      { fileName: "VC-1.pdf", status: "matched", jobId: "a", by: "code" },
    ]);
  });

  it("falls back to serial numbers, and leaves unknown names for manual matching", () => {
    const res = matchCertificateFiles(["SN VC481005 cert.pdf", "scan0001.pdf"], jobs);
    expect(res[0]).toEqual({ fileName: "SN VC481005 cert.pdf", status: "matched", jobId: "job-6", by: "serial" });
    expect(res[1]).toEqual({ fileName: "scan0001.pdf", status: "unmatched" });
  });

  it("prefers the longest code and flags true ambiguity", () => {
    const res = matchCertificateFiles(
      ["C-VC-001.pdf", "both VC-001 and VC-002.pdf"],
      [
        { jobId: "short", code: "VC-001", serialNo: null },
        { jobId: "long", code: "C-VC-001", serialNo: null },
        { jobId: "two", code: "VC-002", serialNo: null },
      ],
    );
    expect(res[0]).toMatchObject({ status: "matched", jobId: "long" });
    expect(res[1]).toMatchObject({ status: "ambiguous", jobIds: ["short", "two"] });
  });

  it("ignores identifiers too short to be meaningful", () => {
    expect(identifierPattern("A1")).toBeNull();
    expect(identifierPattern("C-VC-001")?.test("XC-VC-001")).toBe(false);
  });
});
