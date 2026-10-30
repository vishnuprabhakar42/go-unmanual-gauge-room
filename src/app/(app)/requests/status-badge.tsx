"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/domain/calibration-request-status";
import { cn } from "@/lib/utils";

const CLASS: Record<RequestStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  SUBMITTED: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  APPROVED: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  SOURCING: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
  PO_RAISED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  CLOSED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  CANCELLED: "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-800 dark:text-zinc-400",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const t = useTranslations("requestStatus");
  return <Badge className={cn("border-0 font-medium", CLASS[status])}>{t(status)}</Badge>;
}
