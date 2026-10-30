/**
 * PAN: 5 letters + 4 digits + 1 letter. The 4th letter is the holder type
 * (P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L local authority, J artificial juridical person, G government, K krish).
 */
export const PAN_REGEX = /^[A-Z]{3}[ABCFGHJKLPT][A-Z][0-9]{4}[A-Z]$/;

export function normalizePan(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidPan(input: string): boolean {
  return PAN_REGEX.test(normalizePan(input));
}
