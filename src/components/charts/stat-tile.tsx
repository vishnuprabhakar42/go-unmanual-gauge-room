import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** KPI tile: label, big number, optional status tone (icon + label carry the meaning, not color alone). */
export function StatTile({
  label,
  value,
  href,
  icon: Icon,
  tone,
  hint,
  testId,
}: {
  label: string;
  value: number | string;
  href?: string;
  icon: LucideIcon;
  tone?: "critical" | "warning";
  hint?: string;
  testId?: string;
}) {
  const body = (
    <>
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icon
          className="size-4"
          style={tone ? { color: tone === "critical" ? "var(--viz-critical)" : "var(--viz-warning)" } : undefined}
          aria-hidden="true"
        />
        {label}
      </div>
      <div className="text-3xl font-semibold tabular-nums" data-testid={testId}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </div>
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </>
  );
  const cls = cn("flex flex-col gap-1 rounded-xl border p-4", tone && "border-l-4");
  const style = tone ? { borderLeftColor: tone === "critical" ? "var(--viz-critical)" : "var(--viz-warning)" } : undefined;
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-muted/50 transition-colors")} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}
