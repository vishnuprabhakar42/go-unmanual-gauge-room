import { formatDate } from "@/domain/india/format";
import type { LabJobRow } from "./types";

type Job = {
  id: string;
  status: string;
  labProgress: LabJobRow["labProgress"];
  certificateFileId: string | null;
  sentAt: Date | null;
  vendor: { name: string } | null;
  organization?: { name: string };
  instrument: { code: string; serialNo: string | null; description: string | null; type: { name: string } };
  poItem: { po: { number: string } } | null;
  challanItem: { challan: { number: string | null; expectedReturnAt: Date | null } } | null;
};

export function toLabRows(jobs: Job[]): LabJobRow[] {
  return jobs.map((j) => ({
    id: j.id,
    code: j.instrument.code,
    serialNo: j.instrument.serialNo,
    description: j.instrument.description || j.instrument.type.name,
    customer: j.organization?.name ?? null,
    lab: j.vendor?.name ?? null,
    po: j.poItem?.po.number ?? null,
    challan: j.challanItem?.challan.number ?? null,
    sentAt: j.sentAt ? formatDate(j.sentAt) : null,
    expectedAt: j.challanItem?.challan.expectedReturnAt ? formatDate(j.challanItem.challan.expectedReturnAt) : null,
    status: j.status,
    labProgress: j.labProgress,
    hasCert: !!j.certificateFileId,
    certHref: j.certificateFileId ? `/api/attachments/${j.certificateFileId}` : null,
  }));
}

export function toCandidates(jobs: Job[]) {
  return jobs
    .filter((j) => j.status !== "CERT_UPLOADED" || !j.certificateFileId)
    .map((j) => ({
      jobId: j.id,
      code: j.instrument.code,
      serialNo: j.instrument.serialNo,
      label: `${j.instrument.code} — ${j.instrument.type.name}${j.organization ? ` (${j.organization.name})` : ""}`,
    }));
}
