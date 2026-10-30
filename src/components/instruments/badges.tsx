"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { DueState } from "@/domain/due";
import type { InstrumentStatus } from "@/domain/instrument-status";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<InstrumentStatus, string> = {
  IN_STORE: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  IN_USE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  AWAITING_DISPATCH: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  AT_VENDOR: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  RECEIVED_PENDING_VERIFICATION: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
  ON_HOLD_OOT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  SCRAPPED: "bg-zinc-200 text-zinc-600 line-through dark:bg-zinc-800 dark:text-zinc-400",
  LOST: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatusBadge({ status }: { status: InstrumentStatus }) {
  const t = useTranslations("status");
  return <Badge className={cn("border-0 font-medium", STATUS_CLASS[status])}>{t(status)}</Badge>;
}

const DUE_CLASS: Record<DueState, string> = {
  OVERDUE: "text-red-700 dark:text-red-400 font-medium",
  DUE_SOON: "text-amber-700 dark:text-amber-400 font-medium",
  OK: "text-muted-foreground",
  NOT_SCHEDULED: "text-muted-foreground",
};

/** "12-11-2026 · in 21 days" with colour by due state. */
export function DueText({ state, date, days }: { state: DueState; date: string; days: number | null }) {
  const t = useTranslations("due");
  if (state === "NOT_SCHEDULED" && !date) return <span className="text-muted-foreground">{t("NOT_SCHEDULED")}</span>;
  return (
    <span className={cn("whitespace-nowrap", DUE_CLASS[state])} data-due={state}>
      {date}
      {days !== null && state !== "OK" && state !== "NOT_SCHEDULED" && (
        <span className="block text-xs">{days < 0 ? t("overdueBy", { days: -days }) : t("inDays", { days })}</span>
      )}
    </span>
  );
}
