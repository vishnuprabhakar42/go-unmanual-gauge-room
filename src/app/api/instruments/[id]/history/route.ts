import { formatDate } from "@/domain/india/format";
import { getAppContext } from "@/server/context";
import { INR_FORMAT, workbookResponse } from "@/server/excel";
import { calibrationHistory } from "@/server/services/calibration-history";
import { tenantDb } from "@/server/tenant";

export const dynamic = "force-dynamic";

/** Excel of one instrument's full calibration history. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!ctx.can("instrument.view")) return new Response("Forbidden", { status: 403 });
  const h = await calibrationHistory(tenantDb(ctx.tenant), id);
  if (!h) return new Response("Not found", { status: 404 });
  return workbookResponse(`calibration-history-${h.instrument.code}.xlsx`, [
    {
      name: "Calibration history",
      title: `Calibration history — ${h.instrument.code} (${h.instrument.type.name}) — ${ctx.org.name}`,
      columns: [
        { header: "Calibrated on", key: "calibratedAt" },
        { header: "Result", key: "result", width: 10 },
        { header: "Lab", key: "lab", width: 34 },
        { header: "Accreditation no.", key: "labAccreditation", width: 16 },
        { header: "Standard", key: "standard", width: 24 },
        { header: "PO no.", key: "po", width: 22 },
        { header: "PO date", key: "poDate" },
        { header: "Rate (INR)", key: "rate", numFmt: INR_FORMAT },
        { header: "GST %", key: "gstPercent", width: 8 },
        { header: "GST (INR)", key: "gst", numFmt: INR_FORMAT },
        { header: "Total (INR)", key: "total", numFmt: INR_FORMAT },
        { header: "Challan", key: "challan", width: 18 },
        { header: "Sent", key: "sent" },
        { header: "Received", key: "received" },
        { header: "TAT (days)", key: "tat", width: 10 },
        { header: "Certificate no.", key: "certificateNo", width: 22 },
        { header: "ULR no.", key: "ulrNo", width: 22 },
        { header: "Verified by", key: "verifiedBy", width: 20 },
        { header: "Verified on", key: "verifiedAt" },
        { header: "Next due set", key: "nextDue" },
        { header: "OOT", key: "oot", width: 24 },
        { header: "Notes", key: "notes", width: 30 },
      ],
      rows: h.entries.map((e) => ({
        calibratedAt: formatDate(e.calibratedAt),
        result: e.result,
        lab: e.lab,
        labAccreditation: e.labAccreditation,
        standard: e.standardCode ? `${e.standardCode}${e.standardDate ? ` (${formatDate(e.standardDate)})` : ""}` : null,
        po: e.po?.number,
        poDate: formatDate(e.po?.date ?? null),
        rate: e.cost?.rate,
        gstPercent: e.cost?.gstPercent,
        gst: e.cost?.gst,
        total: e.cost?.total,
        challan: e.challan?.number,
        sent: formatDate(e.sentAt),
        received: formatDate(e.receivedAt),
        tat: e.tatDays,
        certificateNo: e.certificateNo,
        ulrNo: e.ulrNo,
        verifiedBy: e.verifiedBy,
        verifiedAt: formatDate(e.verifiedAt),
        nextDue: formatDate(e.nextDueAt),
        oot: e.oot.map((o) => `${o.status}${o.disposition ? ` (${o.disposition})` : ""}`).join(", "),
        notes: e.manual
          ? "Recorded in the register; no calibration job in Gauge Room"
          : e.status && !e.result
            ? `In progress: ${e.status}`
            : null,
      })),
    },
  ]);
}
