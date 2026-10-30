/**
 * Does a lab's accredited scope cover an instrument? Parameter must match (case-insensitive, either
 * contains the other), unit must match when both are known, and the scope range must contain the
 * instrument's range when both are known.
 */
export type ScopeRow = {
  vendorId: string;
  parameter: string;
  rangeMin: number | null;
  rangeMax: number | null;
  unit: string | null;
};
export type ScopeTarget = { parameter: string | null; rangeMin: number | null; rangeMax: number | null; unit: string | null };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const UNIT_ALIASES: Record<string, string> = { "°c": "c", degc: "c", "deg c": "c", c: "c", micron: "µm", um: "µm", µm: "µm" };
const unitKey = (u: string | null | undefined) => UNIT_ALIASES[norm(u)] ?? norm(u);

export function scopeCovers(scope: ScopeRow, target: ScopeTarget): boolean {
  const p = norm(target.parameter);
  const sp = norm(scope.parameter);
  if (!p || !sp || !(sp.includes(p) || p.includes(sp))) return false;
  if (target.unit && scope.unit && unitKey(target.unit) !== unitKey(scope.unit)) return false;
  if (target.rangeMin != null && scope.rangeMin != null && target.rangeMin < scope.rangeMin) return false;
  if (target.rangeMax != null && scope.rangeMax != null && target.rangeMax > scope.rangeMax) return false;
  return true;
}

export function coveringVendorIds(scopes: readonly ScopeRow[], target: ScopeTarget): Set<string> {
  return new Set(scopes.filter((s) => scopeCovers(s, target)).map((s) => s.vendorId));
}
