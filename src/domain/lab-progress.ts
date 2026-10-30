/**
 * What a lab can report on a job (portal or internal team on its behalf), and its effect on the job:
 *   RECEIVED_AT_LAB  job DISPATCHED → AT_LAB
 *   IN_PROGRESS      job stays AT_LAB
 *   DISPATCHED_BACK  job stays AT_LAB (the plant's inward receipt moves it to RETURNED); needs courier/AWB or a note
 */
export const LAB_PROGRESS = ["RECEIVED_AT_LAB", "IN_PROGRESS", "DISPATCHED_BACK"] as const;
export type LabProgress = (typeof LAB_PROGRESS)[number];

export type LabUpdate = { to: LabProgress; returnCourier?: string | null; returnAwb?: string | null; returnNote?: string | null };

export function nextLabSteps(jobStatus: string, current: LabProgress | null): LabProgress[] {
  if (jobStatus === "DISPATCHED") return ["RECEIVED_AT_LAB"];
  if (jobStatus !== "AT_LAB") return [];
  if (current === "RECEIVED_AT_LAB" || current === null) return ["IN_PROGRESS", "DISPATCHED_BACK"];
  if (current === "IN_PROGRESS") return ["DISPATCHED_BACK"];
  return [];
}

export function validateLabUpdate(jobStatus: string, current: LabProgress | null, u: LabUpdate): string | null {
  if (!nextLabSteps(jobStatus, current).includes(u.to)) return `Can't mark ${u.to.replace(/_/g, " ").toLowerCase()} now`;
  if (u.to === "DISPATCHED_BACK" && !u.returnAwb?.trim() && !u.returnNote?.trim())
    return "Enter the AWB/docket number or a note (e.g. hand delivery)";
  return null;
}
