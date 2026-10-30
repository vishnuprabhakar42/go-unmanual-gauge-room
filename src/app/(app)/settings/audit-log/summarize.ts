const IGNORED = new Set(["id", "organizationId", "createdAt", "updatedAt"]);

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Human summary of an audit row: changed fields for updates, key fields for creates. */
export function summarizeChange(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  if (!before) {
    return Object.entries(a)
      .filter(([k, v]) => !IGNORED.has(k) && v !== null && !k.endsWith("Id"))
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${show(v)}`)
      .join(" · ");
  }
  const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => !IGNORED.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
  return changed.map((k) => `${k}: ${show(b[k])} → ${show(a[k])}`).join(" · ");
}
