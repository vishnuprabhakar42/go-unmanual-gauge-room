import Link from "next/link";
import { cn } from "@/lib/utils";

export type Column = { key: string; label: string; value: number; href?: string; tone?: "series" | "critical"; tooltip: string };

/**
 * Single-series column chart in plain HTML (server-rendered). Thin bars with 4px rounded tops on a
 * baseline, direct value labels, a per-bar hover tooltip, bars as drill-down links, and a table view.
 */
export function ColumnChart({
  columns,
  ariaLabel,
  tableLabels,
  height = 160,
}: {
  columns: Column[];
  ariaLabel: string;
  tableLabels: { label: string; value: string; table: string };
  height?: number;
}) {
  const max = Math.max(1, ...columns.map((c) => c.value));
  return (
    <figure className="space-y-2">
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex items-end gap-2 border-b px-1"
        style={{ height: height + 20, borderColor: "var(--viz-grid)" }}
      >
        {columns.map((c) => {
          const bar = (
            <>
              <span className="text-foreground mb-1 block text-xs font-medium tabular-nums">
                {c.value.toLocaleString("en-IN")}
              </span>
              <span
                className="block w-full max-w-10 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                style={{
                  height: Math.max(c.value ? 3 : 0, (c.value / max) * height),
                  background: c.tone === "critical" ? "var(--viz-critical)" : "var(--viz-series-1)",
                }}
              />
              <span
                role="tooltip"
                className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm group-hover:block group-focus-visible:block"
              >
                {c.tooltip}
              </span>
            </>
          );
          const cls = "group relative flex h-full flex-1 flex-col items-center justify-end outline-none";
          return c.href ? (
            <Link
              key={c.key}
              href={c.href}
              className={cn(cls, "focus-visible:ring-ring/50 rounded-sm focus-visible:ring-2")}
              aria-label={c.tooltip}
            >
              {bar}
            </Link>
          ) : (
            <div key={c.key} className={cls}>
              {bar}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 px-1">
        {columns.map((c) => (
          <span
            key={c.key}
            className={cn(
              "text-muted-foreground flex-1 truncate text-center text-xs",
              c.tone === "critical" && "text-foreground font-medium",
            )}
          >
            {c.label}
          </span>
        ))}
      </div>
      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer">{tableLabels.table}</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th className="font-normal">{tableLabels.label}</th>
              <th className="text-right font-normal">{tableLabels.value}</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td className="text-right tabular-nums">{c.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
