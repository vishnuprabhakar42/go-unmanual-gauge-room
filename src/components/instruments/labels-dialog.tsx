"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/** Posts the selected ids to the label PDF route; the PDF opens in a new tab. */
export function LabelsDialog({ open, onOpenChange, ids }: { open: boolean; onOpenChange: (v: boolean) => void; ids: string[] }) {
  const t = useTranslations("labels");
  const [size, setSize] = useState<"50x25" | "38x25">("50x25");
  const [layout, setLayout] = useState<"roll" | "a4">("roll");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form method="post" action="/api/instruments/labels" target="_blank" onSubmit={() => onOpenChange(false)}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("hint")}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="ids" value={ids.join(",")} />
          <fieldset className="my-4 space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("size")}</legend>
            {(["50x25", "38x25"] as const).map((s) => (
              <div key={s} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  id={`size-${s}`}
                  name="size"
                  value={s}
                  checked={size === s}
                  onChange={() => setSize(s)}
                  className="size-4"
                />
                <Label htmlFor={`size-${s}`}>{s === "50x25" ? t("s50") : t("s38")}</Label>
              </div>
            ))}
          </fieldset>
          <fieldset className="my-4 space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("layout")}</legend>
            {(["roll", "a4"] as const).map((l) => (
              <div key={l} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  id={`layout-${l}`}
                  name="layout"
                  value={l}
                  checked={layout === l}
                  onChange={() => setLayout(l)}
                  className="size-4"
                />
                <Label htmlFor={`layout-${l}`}>{l === "roll" ? t("roll") : t("a4")}</Label>
              </div>
            ))}
          </fieldset>
          <DialogFooter>
            <span className="text-muted-foreground mr-auto self-center text-sm">{t("count", { count: ids.length })}</span>
            <Button type="submit" disabled={ids.length === 0}>
              {t("generate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
