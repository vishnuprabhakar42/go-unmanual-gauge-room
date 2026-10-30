import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { amountInWordsINR, computeTotals } from "@/domain/gst";
import { formatDate } from "@/domain/india/format";
import { GST_STATES } from "@/domain/india/states";
import type { Contact } from "@/domain/vendor-schemas";
import { tenantDb } from "@/server/tenant";

/** Built-in Helvetica has no ₹ glyph, so PDFs print "INR" with Indian digit grouping. */
const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr = (n: number) => money.format(n);

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  row: { flexDirection: "row" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  muted: { color: "#555" },
  box: { borderWidth: 0.75, borderColor: "#999", padding: 8, flex: 1 },
  th: { fontFamily: "Helvetica-Bold", backgroundColor: "#eeeeee", paddingVertical: 4, paddingHorizontal: 3 },
  td: { paddingVertical: 4, paddingHorizontal: 3, borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  right: { textAlign: "right" },
});

const COLS: readonly {
  key: "sno" | "code" | "desc" | "sac" | "tat" | "rate" | "gst" | "amt";
  label: string;
  w: number;
  right?: boolean;
}[] = [
  { key: "sno", label: "#", w: 18 },
  { key: "code", label: "Instrument", w: 70 },
  { key: "desc", label: "Description", w: 170 },
  { key: "sac", label: "SAC", w: 42 },
  { key: "tat", label: "TAT (days)", w: 42, right: true },
  { key: "rate", label: "Rate", w: 62, right: true },
  { key: "gst", label: "GST %", w: 36, right: true },
  { key: "amt", label: "Amount", w: 70, right: true },
];

export type PoPdfData = {
  number: string;
  date: Date;
  status: string;
  orgName: string;
  orgPan: string | null;
  plant: { name: string; address: string | null; gstin: string | null; stateCode: string | null };
  vendor: {
    name: string;
    address: string | null;
    gstin: string | null;
    pan: string | null;
    stateCode: string | null;
    contact: Contact | null;
    nablCertNo: string | null;
  };
  refs: { request: string | null; rfq: string | null; contract: string | null };
  interState: boolean;
  items: { code: string; description: string; sac: string | null; tatDays: number; rate: number; gstPercent: number }[];
  approvedBy: string | null;
};

function PoDocument({ d }: { d: PoPdfData }) {
  const totals = computeTotals(
    d.items.map((i) => ({ rate: i.rate, gstPercent: i.gstPercent })),
    d.interState,
  );
  const state = (code: string | null) => (code ? `${GST_STATES[code] ?? ""} (${code})` : "—");
  return (
    <Document title={`Purchase order ${d.number}`} author={d.orgName}>
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 12 }]}>
          <View>
            <Text style={s.h1}>{d.orgName}</Text>
            <Text style={s.muted}>{d.plant.name}</Text>
            {d.plant.address && <Text style={s.muted}>{d.plant.address}</Text>}
            <Text style={s.muted}>
              GSTIN: {d.plant.gstin ?? "—"}
              {d.orgPan ? `   PAN: ${d.orgPan}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>PURCHASE ORDER</Text>
            <Text>No: {d.number}</Text>
            <Text>Date: {formatDate(d.date)}</Text>
            {d.status !== "APPROVED" && d.status !== "SENT" && d.status !== "ACKNOWLEDGED" && d.status !== "CLOSED" && (
              <Text style={{ color: "#b00", fontFamily: "Helvetica-Bold" }}>
                {d.status === "CANCELLED" ? "CANCELLED" : "DRAFT — NOT APPROVED"}
              </Text>
            )}
          </View>
        </View>

        <View style={[s.row, { gap: 8, marginBottom: 10 }]}>
          <View style={s.box}>
            <Text style={s.h2}>Vendor (calibration laboratory)</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{d.vendor.name}</Text>
            {d.vendor.address && <Text>{d.vendor.address}</Text>}
            <Text>GSTIN: {d.vendor.gstin ?? "—"}</Text>
            <Text>PAN: {d.vendor.pan ?? "—"}</Text>
            <Text>State: {state(d.vendor.stateCode)}</Text>
            {d.vendor.nablCertNo && <Text>NABL cert: {d.vendor.nablCertNo}</Text>}
            {d.vendor.contact && (
              <Text>
                Contact: {d.vendor.contact.name}
                {d.vendor.contact.phone ? `, ${d.vendor.contact.phone}` : ""}
                {d.vendor.contact.email ? `, ${d.vendor.contact.email}` : ""}
              </Text>
            )}
          </View>
          <View style={s.box}>
            <Text style={s.h2}>Bill to / Ship to</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {d.orgName} — {d.plant.name}
            </Text>
            {d.plant.address && <Text>{d.plant.address}</Text>}
            <Text>GSTIN: {d.plant.gstin ?? "—"}</Text>
            <Text>Place of supply: {state(d.plant.stateCode)}</Text>
            <Text style={{ marginTop: 4 }}>Ref. calibration request: {d.refs.request ?? "—"}</Text>
            {d.refs.contract && <Text>Rate contract: {d.refs.contract}</Text>}
            {d.refs.rfq && <Text>RFQ: {d.refs.rfq}</Text>}
          </View>
        </View>

        <View style={[s.row, { borderBottomWidth: 0.75, borderBottomColor: "#999" }]}>
          {COLS.map((c) => (
            <Text key={c.key} style={[s.th, { width: c.w }, c.right ? s.right : {}]}>
              {c.label}
            </Text>
          ))}
        </View>
        {d.items.map((i, idx) => {
          const cells: Record<(typeof COLS)[number]["key"], string> = {
            sno: String(idx + 1),
            code: i.code,
            desc: i.description,
            sac: i.sac ?? "",
            tat: String(i.tatDays),
            rate: inr(i.rate),
            gst: String(i.gstPercent),
            amt: inr(i.rate),
          };
          return (
            <View key={idx} style={s.row} wrap={false}>
              {COLS.map((c) => (
                <Text key={c.key} style={[s.td, { width: c.w }, c.right ? s.right : {}]}>
                  {cells[c.key]}
                </Text>
              ))}
            </View>
          );
        })}

        <View style={{ alignSelf: "flex-end", width: 230, marginTop: 8 }} wrap={false}>
          {[
            ["Taxable value", totals.subtotal],
            ...(d.interState
              ? [["IGST", totals.igst] as const]
              : [["CGST", totals.cgst] as const, ["SGST", totals.sgst] as const]),
          ].map(([label, value]) => (
            <View key={label} style={[s.row, { justifyContent: "space-between", paddingVertical: 2 }]}>
              <Text>{label}</Text>
              <Text>INR {inr(value as number)}</Text>
            </View>
          ))}
          <View
            style={[
              s.row,
              { justifyContent: "space-between", paddingVertical: 3, borderTopWidth: 0.75, borderTopColor: "#999", marginTop: 2 },
            ]}
          >
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Total</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>INR {inr(totals.total)}</Text>
          </View>
        </View>
        <Text style={{ marginTop: 6 }}>Amount in words: {amountInWordsINR(totals.total)}</Text>

        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={s.h2}>Terms</Text>
          {[
            "Calibration to be performed under NABL accreditation (ISO/IEC 17025) within the laboratory's accredited scope where required.",
            "Certificates must show the certificate number, ULR number, calibration date, as-found/as-left readings, measurement uncertainty and traceability.",
            "Instruments are sent on a returnable delivery challan and must be returned with the certificates within the agreed turnaround time.",
            "Please acknowledge this order and quote the PO number on your invoice. Payment: 30 days from receipt of instruments, certificates and invoice.",
          ].map((t, i) => (
            <Text key={i} style={{ marginBottom: 2 }}>
              {i + 1}. {t}
            </Text>
          ))}
        </View>

        <View style={[s.row, { justifyContent: "flex-end", marginTop: 30 }]} wrap={false}>
          <View style={{ alignItems: "center", width: 200 }}>
            <Text>For {d.orgName}</Text>
            <Text
              style={{
                marginTop: 26,
                borderTopWidth: 0.5,
                borderTopColor: "#555",
                paddingTop: 3,
                width: 180,
                textAlign: "center",
              }}
            >
              Authorised signatory
            </Text>
            {d.approvedBy && <Text style={s.muted}>Approved by {d.approvedBy}</Text>}
          </View>
        </View>
        <Text
          style={[s.muted, { position: "absolute", bottom: 18, left: 32, fontSize: 7 }]}
          fixed
          render={({ pageNumber, totalPages }) => `${d.number} · Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function renderPurchaseOrderPdf(d: PoPdfData): Promise<Buffer> {
  return renderToBuffer(<PoDocument d={d} />);
}

/** Loads a PO (system read scoped to the org) and renders it. Used by the PDF route and email attachments. */
export async function renderPurchaseOrderPdfById(
  organizationId: string,
  poId: string,
  plantIds: "ALL" | readonly string[] = "ALL",
) {
  const db = tenantDb({ organizationId, actorId: null, plantIds, ip: null });
  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: {
      plant: true,
      vendor: true,
      request: { select: { number: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          instrument: { select: { code: true } },
          requestItem: { select: { rateContractItem: { select: { contract: { select: { number: true } } } } } },
        },
      },
    },
  });
  const [org, rfq, approver] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, pan: true, gstin: true } }),
    po.rfqId ? db.rfq.findUnique({ where: { id: po.rfqId }, select: { number: true } }) : null,
    po.approvedById ? db.user.findUnique({ where: { id: po.approvedById }, select: { name: true, email: true } }) : null,
  ]);
  const contacts = (po.vendor.contacts ?? []) as Contact[];
  const data: PoPdfData = {
    number: po.number,
    date: po.approvedAt ?? po.createdAt,
    status: po.status,
    orgName: org.name,
    orgPan: org.pan,
    plant: { name: po.plant.name, address: po.plant.address, gstin: po.plant.gstin ?? org.gstin, stateCode: po.plant.stateCode },
    vendor: {
      name: po.vendor.name,
      address: po.vendor.address,
      gstin: po.vendor.gstin,
      pan: po.vendor.pan,
      stateCode: po.vendor.stateCode,
      contact: contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null,
      nablCertNo: po.vendor.accreditationType === "NABL" ? po.vendor.nablCertNo : null,
    },
    refs: {
      request: po.request?.number ?? null,
      rfq: rfq?.number ?? null,
      contract: po.items.map((i) => i.requestItem?.rateContractItem?.contract.number).find(Boolean) ?? null,
    },
    interState: po.interState,
    items: po.items.map((i) => ({
      code: i.instrument.code,
      description: i.description,
      sac: i.sacCode,
      tatDays: i.tatDays,
      rate: i.rate.toNumber(),
      gstPercent: i.gstPercent.toNumber(),
    })),
    approvedBy: approver ? (approver.name ?? approver.email) : null,
  };
  return { buffer: await renderPurchaseOrderPdf(data), fileName: `${po.number.replace(/\//g, "-")}.pdf` };
}
