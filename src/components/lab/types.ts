import type { ActionResult } from "@/server/action";

export type LabJobRow = {
  id: string;
  code: string;
  serialNo: string | null;
  description: string;
  customer: string | null;
  lab: string | null;
  po: string | null;
  challan: string | null;
  sentAt: string | null;
  expectedAt: string | null;
  status: string;
  labProgress: "RECEIVED_AT_LAB" | "IN_PROGRESS" | "DISPATCHED_BACK" | null;
  hasCert: boolean;
  certHref: string | null;
};

export type LabProgressAction = (input: {
  jobId: string;
  to: "RECEIVED_AT_LAB" | "IN_PROGRESS" | "DISPATCHED_BACK";
  returnCourier?: string;
  returnAwb?: string;
  returnNote?: string;
}) => Promise<ActionResult<null>>;

export type UploadAction = (form: FormData) => Promise<ActionResult<{ code: string }>>;
