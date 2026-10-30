"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";

export function MobileNav({ allowed, orgName }: { allowed: string[]; orgName: string }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 lg:hidden" aria-label={t("openMenu")}>
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="truncate">{orgName}</span>
          </SheetTitle>
        </SheetHeader>
        <SidebarNav allowed={allowed} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
