"use client";

import { Bookmark, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeViewAction, saveViewAction } from "@/server/actions/saved-views";

export type SavedViewItem = { id: string; name: string; query: string; shared: boolean; mine: boolean };

/** Saved filter sets for a list page (stored server-side, optionally shared with the org). */
export function SavedViews({ page, views }: { page: string; views: SavedViewItem[] }) {
  const t = useTranslations("views");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [pending, start] = useTransition();

  const currentQuery = (() => {
    const q = new URLSearchParams(params);
    q.delete("page");
    return q.toString();
  })();

  const save = () =>
    start(async () => {
      const res = await saveViewAction({ page, name, query: currentQuery, shared, path: pathname });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("saved"));
      setOpen(false);
      setName("");
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-10" data-testid="saved-views">
            <Bookmark className="size-4" />
            {t("savedViews")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {views.length === 0 && <DropdownMenuLabel className="text-muted-foreground font-normal">{t("none")}</DropdownMenuLabel>}
          {views.map((v) => (
            <DropdownMenuItem key={v.id} className="justify-between" onSelect={() => router.replace(`${pathname}?${v.query}`)}>
              <span className="truncate">
                {v.name}
                {v.shared && <span className="text-muted-foreground ml-1 text-xs">· {t("sharedLabel")}</span>}
              </span>
              {v.mine && (
                <button
                  type="button"
                  aria-label={t("remove")}
                  className="hover:text-destructive p-1"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    start(async () => {
                      const res = await removeViewAction({ id: v.id, path: pathname });
                      if (!res.ok) toast.error(res.error);
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)}>{t("save")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("save")}</DialogTitle>
          </DialogHeader>
          <Field label={t("name")} htmlFor="view-name">
            <Input id="view-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox id="view-shared" checked={shared} onCheckedChange={(v) => setShared(v === true)} />
            <Label htmlFor="view-shared">{t("shared")}</Label>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={pending || !name.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
