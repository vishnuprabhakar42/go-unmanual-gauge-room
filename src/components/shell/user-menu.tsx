"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "./actions";

export function UserMenu({ name, email, roles }: { name: string | null; email: string; roles: string[] }) {
  const t = useTranslations();
  const initials = (name ?? email)
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="size-10 rounded-full p-0" aria-label={name ?? email} data-testid="user-menu">
          <Avatar className="size-9">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{name ?? email}</div>
          <div className="text-muted-foreground text-xs">{email}</div>
          <div className="text-muted-foreground mt-1 text-xs">{roles.map((r) => t(`roles.${r}`)).join(", ")}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOutAction()}>
          <LogOut className="size-4" />
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
