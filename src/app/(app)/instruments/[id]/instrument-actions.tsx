"use client";

import { Archive, ChevronDown, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { LabelsDialog } from "@/components/instruments/labels-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { InstrumentStatus } from "@/domain/instrument-status";
import { archiveInstrumentAction, changeStatusAction } from "../actions";

const LABEL: Partial<Record<InstrumentStatus, string>> = { IN_USE: "markInUse", IN_STORE: "markInStore", LOST: "markLost" };

export function InstrumentActions({
  id,
  code,
  archived,
  transitions,
}: {
  id: string;
  code: string;
  archived: boolean;
  transitions: InstrumentStatus[];
}) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const change = (to: InstrumentStatus, why?: string) =>
    start(async () => {
      const res = await changeStatusAction({ id, to, reason: why });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("instruments.statusChanged"));
      setLostOpen(false);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {!archived && (
        <Button asChild variant="outline" className="h-10">
          <Link href={`/instruments/${id}/edit`}>
            <Pencil className="size-4" />
            {t("common.edit")}
          </Link>
        </Button>
      )}
      <Button variant="outline" className="h-10" onClick={() => setLabelOpen(true)}>
        <Printer className="size-4" />
        {t("instruments.label")}
      </Button>
      {!archived && transitions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-10" disabled={pending}>
              {t("instruments.changeStatus")}
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {transitions.map((to) => (
              <DropdownMenuItem key={to} onSelect={() => (to === "LOST" ? setLostOpen(true) : change(to))}>
                {t(`instruments.${LABEL[to] ?? "changeStatus"}` as "instruments.markLost")}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="ghost"
        className="h-10"
        disabled={pending}
        onClick={() => {
          if (!archived && !window.confirm(t("instruments.archiveConfirm", { code }))) return;
          start(async () => {
            const res = await archiveInstrumentAction({ id, archived: !archived });
            if (!res.ok) toast.error(res.error);
          });
        }}
      >
        <Archive className="size-4" />
        {archived ? t("common.restore") : t("common.archive")}
      </Button>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("instruments.lostTitle", { code })}</DialogTitle>
          </DialogHeader>
          <Field label={t("instruments.lostReason")} htmlFor="lost-reason">
            <Textarea id="lost-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="destructive" disabled={pending || !reason.trim()} onClick={() => change("LOST", reason)}>
              {t("instruments.markLost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LabelsDialog open={labelOpen} onOpenChange={setLabelOpen} ids={[id]} />
    </div>
  );
}
