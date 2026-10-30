/**
 * Auto-match uploaded certificate PDFs to calibration jobs from the file name.
 * - Instrument code match (strong): the code's alphanumeric chunks appear in order, separated by any of
 *   "-", "_", ".", space or nothing, with no letter/digit directly before or after
 *   (so "VC-1" never matches "VC-10", and "C-VC-001" matches "Cert_C_VC_001_rev2.pdf").
 * - Serial number match (weaker): same rule on the serial.
 * A file matches when exactly one job has the best score; otherwise it is ambiguous or unmatched
 * and the user picks the job manually.
 */
export type MatchCandidate = { jobId: string; code: string; serialNo: string | null };
export type FileMatch =
  | { fileName: string; status: "matched"; jobId: string; by: "code" | "serial" }
  | { fileName: string; status: "ambiguous"; jobIds: string[] }
  | { fileName: string; status: "unmatched" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex for an identifier with flexible separators and alphanumeric boundaries. */
export function identifierPattern(id: string): RegExp | null {
  const chunks = id.toUpperCase().match(/[A-Z0-9]+/g);
  if (!chunks || chunks.join("").length < 3) return null; // too short to be meaningful
  return new RegExp(`(?<![A-Z0-9])${chunks.map(escape).join("[-_. ]?")}(?![A-Z0-9])`);
}

export function stem(fileName: string): string {
  return fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "").toUpperCase();
}

export function matchCertificateFiles(fileNames: readonly string[], candidates: readonly MatchCandidate[]): FileMatch[] {
  const compiled = candidates.map((c) => ({
    ...c,
    codeRe: identifierPattern(c.code),
    serialRe: c.serialNo ? identifierPattern(c.serialNo) : null,
  }));
  return fileNames.map((fileName) => {
    const s = stem(fileName);
    const byCode = compiled.filter((c) => c.codeRe?.test(s));
    // Prefer the longest code when one code contains another as a separate token (e.g. "C-VC-001" vs "VC-001")
    const longest = byCode.length > 1 ? Math.max(...byCode.map((c) => c.code.length)) : 0;
    const codeHits = byCode.length > 1 ? byCode.filter((c) => c.code.length === longest) : byCode;
    if (codeHits.length === 1) return { fileName, status: "matched", jobId: codeHits[0].jobId, by: "code" };
    if (codeHits.length > 1) return { fileName, status: "ambiguous", jobIds: codeHits.map((c) => c.jobId) };
    const serialHits = compiled.filter((c) => c.serialRe?.test(s));
    if (serialHits.length === 1) return { fileName, status: "matched", jobId: serialHits[0].jobId, by: "serial" };
    if (serialHits.length > 1) return { fileName, status: "ambiguous", jobIds: serialHits.map((c) => c.jobId) };
    return { fileName, status: "unmatched" };
  });
}
