/**
 * GSTIN: 15 chars = 2-digit state code + 10-char PAN + entity number (1-9A-Z) + 'Z' + check char.
 * Check char uses the GSTN mod-36 algorithm over the first 14 characters.
 */
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Valid GST state/UT codes (01–38) plus 97 (Other Territory) and 99 (Centre Jurisdiction). */
export function isValidGstStateCode(code: string): boolean {
  if (!/^[0-9]{2}$/.test(code)) return false;
  const n = Number(code);
  return (n >= 1 && n <= 38) || n === 97 || n === 99;
}

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    if (value < 0) throw new Error(`Invalid GSTIN character: ${first14[i]}`);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export function normalizeGstin(input: string): string {
  return input.trim().toUpperCase();
}

export type GstinValidation = { valid: true } | { valid: false; reason: string };

export function validateGstin(input: string): GstinValidation {
  const g = normalizeGstin(input);
  if (g.length !== 15) return { valid: false, reason: "GSTIN must be 15 characters" };
  if (!GSTIN_REGEX.test(g)) return { valid: false, reason: "GSTIN format is invalid" };
  if (!isValidGstStateCode(g.slice(0, 2))) return { valid: false, reason: "Unknown state code" };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { valid: false, reason: "GSTIN checksum does not match" };
  return { valid: true };
}

export function isValidGstin(input: string): boolean {
  return validateGstin(input).valid;
}

/** State code (first two digits) of a GSTIN. */
export function gstinStateCode(gstin: string): string {
  return normalizeGstin(gstin).slice(0, 2);
}

/** PAN embedded in a GSTIN (chars 3–12). */
export function gstinPan(gstin: string): string {
  return normalizeGstin(gstin).slice(2, 12);
}
