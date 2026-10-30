"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export function SidebarNav({ allowed, onNavigate }: { allowed: string[]; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Main">
      {NAV_ITEMS.filter((i) => allowed.includes(i.href)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const content = (
          <>
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 truncate">{t(item.label)}</span>
            {item.soon && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {tc("soon")}
              </Badge>
            )}
          </>
        );
        const cls = cn(
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
          active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
          item.soon && "text-muted-foreground pointer-events-none",
        );
        return item.soon ? (
          <span key={item.href} className={cls} aria-disabled="true">
            {content}
          </span>
        ) : (
          <Link key={item.href} href={item.href} className={cls} onClick={onNavigate} aria-current={active ? "page" : undefined}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
