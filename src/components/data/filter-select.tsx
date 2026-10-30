"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

/** A select bound to one URL search param; changing it resets pagination. */
export function FilterSelect({
  param,
  allLabel,
  options,
  className,
}: {
  param: string;
  allLabel: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const value = params.get(param) ?? ALL;
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const next = new URLSearchParams(params);
        if (v === ALL) next.delete(param);
        else next.set(param, v);
        next.delete("page");
        start(() => router.replace(`${pathname}?${next.toString()}`));
      }}
    >
      <SelectTrigger
        className={cn("h-10 w-full sm:w-44", value !== ALL && "border-primary", pending && "opacity-60", className)}
        aria-label={allLabel}
        data-testid={`filter-${param}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
