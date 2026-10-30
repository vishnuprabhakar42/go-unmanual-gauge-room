import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "muted" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  danger: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  muted: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  violet: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
};

/** Status label with a tone; the text carries the meaning, colour only reinforces it. */
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return <Badge className={cn("border-0 font-medium", TONES[tone])}>{label}</Badge>;
}

export const PO_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  SENT: "violet",
  ACKNOWLEDGED: "success",
  CLOSED: "muted",
  CANCELLED: "muted",
};
export const RFQ_TONE: Record<string, Tone> = { OPEN: "info", CLOSED: "warning", AWARDED: "success", CANCELLED: "muted" };
export const QUOTE_TONE: Record<string, Tone> = {
  SUBMITTED: "warning",
  TECH_APPROVED: "success",
  TECH_REJECTED: "danger",
  AWARDED: "success",
  LOST: "muted",
};
export const CONTRACT_TONE: Record<string, Tone> = { DRAFT: "neutral", ACTIVE: "success", EXPIRED: "muted" };
export const OOT_TONE: Record<string, Tone> = { OPEN: "danger", ASSESSING: "warning", DISPOSITIONED: "info", CLOSED: "muted" };
export const RESULT_TONE: Record<string, Tone> = { PASS: "success", FAIL: "danger" };
export const PACK_TONE: Record<string, Tone> = { QUEUED: "neutral", RUNNING: "info", READY: "success", FAILED: "danger" };
