"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export function EntityFilter({ entities, allLabel }: { entities: string[]; allLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      value={params.get("entity") ?? ALL}
      onValueChange={(v) => {
        const next = new URLSearchParams(params);
        if (v === ALL) next.delete("entity");
        else next.set("entity", v);
        next.delete("page");
        router.replace(`${pathname}?${next.toString()}`);
      }}
    >
      <SelectTrigger className="h-10 w-48" aria-label={allLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {entities.map((e) => (
          <SelectItem key={e} value={e}>
            {e}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
