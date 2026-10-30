"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

/** Debounced search box bound to the `q` URL param (server-side filtering). */
export function SearchInput({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value === current) return;
    const id = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`));
    }, 300);
    return () => clearTimeout(id);
  }, [value, params, pathname, router]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 pl-9"
      />
    </div>
  );
}
