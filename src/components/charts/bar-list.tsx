import Link from "next/link";

export type BarItem = { key: string; label: string; value: number; href?: string };

/** Horizontal single-series bars with labels and values (ranked breakdowns, aging buckets). */
export function BarList({ items, ariaLabel, empty }: { items: BarItem[]; ariaLabel: string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length && empty) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul aria-label={ariaLabel} className="space-y-2">
      {items.map((i) => {
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{i.label}</span>
              <span className="font-medium tabular-nums">{i.value.toLocaleString("en-IN")}</span>
            </div>
            <div className="mt-1 h-2 w-full">
              <div
                className="h-2 rounded-r-[4px]"
                style={{ width: `${Math.max(i.value ? 2 : 0, (i.value / max) * 100)}%`, background: "var(--viz-series-1)" }}
              />
            </div>
          </>
        );
        return (
          <li key={i.key}>
            {i.href ? (
              <Link href={i.href} className="hover:bg-muted/50 block rounded-md p-1">
                {row}
              </Link>
            ) : (
              <div className="p-1">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
