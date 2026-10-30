import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { CHALLAN_REASON, challanCopies, totalValue } from "@/domain/challan";
import { amountInWordsINR } from "@/domain/gst";
import { formatDate, formatDateTime } from "@/domain/india/format";
import { GST_STATES } from "@/domain/india/states";
import { parseOrgSettings } from "@/domain/settings";
import { tenantDb } from "@/server/tenant";

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr = (n: number) => money.format(n);
const state = (code: string | null) => (code ? `${GST_STATES[code] ?? ""} (${code})` : "—");

const s = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  row: { flexDirection: "row" },
  h1: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#555" },
  box: { borderWidth: 0.75, borderColor: "#999", padding: 7, flex: 1 },
  th: { fontFamily: "Helvetica-Bold", backgroundColor: "#eeeeee", paddingVertical: 4, paddingHorizontal: 3 },
  td: { paddingVertical: 4, paddingHorizontal: 3, borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  right: { textAlign: "right" },
});

type Party = { name: string; address: string | null; gstin: string | null; stateCode: string | null };
export type ChallanPdfData = {
  number: string | null;
  date: Date | null;
  status: string;
  poNumber: string;
  consignor: Party;
  consignee: Party;
  placeOfSupply: string | null;
  transport: {
    mode: string | null;
    vehicleNo: string | null;
    courierName: string | null;
    awbNo: string | null;
    ewayBillNo: string | null;
  };
  expectedReturnAt: Date | null;
  items: { code: string; description: string; hsnCode: string | null; qty: number; value: number }[];
  copies: readonly string[];
  orgName: string;
};

const TRANSPORT: Record<string, string> = {
  BY_HAND: "By hand",
  COURIER: "Courier",
  VEHICLE: "Vehicle",
  VENDOR_PICKUP: "Picked up by laboratory",
};

function PartyBox({ title, p }: { title: string; p: Party }) {
  return (
    <View style={s.box}>
      <Text style={[s.bold, { marginBottom: 3 }]}>{title}</Text>
      <Text style={s.bold}>{p.name}</Text>
      {p.address && <Text>{p.address}</Text>}
      <Text>GSTIN: {p.gstin ?? "Unregistered"}</Text>
      <Text>State: {state(p.stateCode)}</Text>
    </View>
  );
}

function ChallanCopy({ d, copy }: { d: ChallanPdfData; copy: string }) {
  const total = totalValue(d.items);
  const transportLine = [
    d.transport.mode ? TRANSPORT[d.transport.mode] : null,
    d.transport.vehicleNo,
    d.transport.courierName && `${d.transport.courierName}${d.transport.awbNo ? ` AWB ${d.transport.awbNo}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Page size="A4" style={s.page}>
      <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
        <View>
          <Text style={s.h1}>DELIVERY CHALLAN</Text>
          <Text style={s.muted}>Returnable — Rule 55 of the CGST Rules, 2017 (goods sent for calibration)</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.bold, { borderWidth: 0.75, borderColor: "#111", paddingHorizontal: 5, paddingVertical: 2 }]}>
            {copy}
          </Text>
          {d.status === "DRAFT" && (
            <Text style={{ color: "#b00", marginTop: 3, fontFamily: "Helvetica-Bold" }}>DRAFT — NOT ISSUED</Text>
          )}
          {d.status === "CANCELLED" && (
            <Text style={{ color: "#b00", marginTop: 3, fontFamily: "Helvetica-Bold" }}>CANCELLED</Text>
          )}
        </View>
      </View>

      <View style={[s.row, { gap: 8, marginBottom: 8 }]}>
        <View style={s.box}>
          <Text>
            <Text style={s.bold}>Challan no.: </Text>
            {d.number ?? "—"}
          </Text>
          <Text>
            <Text style={s.bold}>Date: </Text>
            {formatDate(d.date) || "—"}
          </Text>
          <Text>
            <Text style={s.bold}>Against PO: </Text>
            {d.poNumber}
          </Text>
        </View>
        <View style={s.box}>
          <Text>
            <Text style={s.bold}>Place of supply: </Text>
            {state(d.placeOfSupply)}
          </Text>
          <Text>
            <Text style={s.bold}>Transport: </Text>
            {transportLine || "—"}
          </Text>
          <Text>
            <Text style={s.bold}>e-way bill: </Text>
            {d.transport.ewayBillNo ?? "—"}
          </Text>
          <Text>
            <Text style={s.bold}>Expected return: </Text>
            {formatDate(d.expectedReturnAt) || "—"}
          </Text>
        </View>
      </View>

      <View style={[s.row, { gap: 8, marginBottom: 10 }]}>
        <PartyBox title="Consignor" p={d.consignor} />
        <PartyBox title="Consignee (calibration laboratory)" p={d.consignee} />
      </View>

      <View style={[s.row, { borderBottomWidth: 0.75, borderBottomColor: "#999" }]}>
        <Text style={[s.th, { width: 22 }]}>#</Text>
        <Text style={[s.th, { width: 250 }]}>Description of goods</Text>
        <Text style={[s.th, { width: 55 }]}>HSN</Text>
        <Text style={[s.th, { width: 40 }, s.right]}>Qty</Text>
        <Text style={[s.th, { width: 40 }]}>Unit</Text>
        <Text style={[s.th, { width: 120 }, s.right]}>Value (INR)</Text>
      </View>
      {d.items.map((i, idx) => (
        <View key={idx} style={s.row} wrap={false}>
          <Text style={[s.td, { width: 22 }]}>{idx + 1}</Text>
          <Text style={[s.td, { width: 250 }]}>
            {i.code} — {i.description}
          </Text>
          <Text style={[s.td, { width: 55 }]}>{i.hsnCode ?? ""}</Text>
          <Text style={[s.td, { width: 40 }, s.right]}>{i.qty}</Text>
          <Text style={[s.td, { width: 40 }]}>Nos</Text>
          <Text style={[s.td, { width: 120 }, s.right]}>{inr(i.value * i.qty)}</Text>
        </View>
      ))}
      <View style={[s.row, { justifyContent: "flex-end", marginTop: 4 }]} wrap={false}>
        <View style={{ width: 230 }}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={s.bold}>Total value</Text>
            <Text style={s.bold}>INR {inr(total)}</Text>
          </View>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text>CGST / SGST / IGST</Text>
            <Text>Not applicable (not a supply)</Text>
          </View>
        </View>
      </View>
      <Text style={{ marginTop: 4 }}>Value in words: {amountInWordsINR(total)}</Text>

      <View style={{ marginTop: 12 }} wrap={false}>
        <Text>
          <Text style={s.bold}>Reason for sending: </Text>
          {CHALLAN_REASON}
        </Text>
        <Text style={{ marginTop: 3 }}>
          Declaration: The goods listed above are our own measuring instruments sent to the consignee for calibration only. They
          will be returned to the consignor after calibration. No sale or transfer of ownership is involved.
        </Text>
      </View>

      <View style={[s.row, { justifyContent: "space-between", marginTop: 40 }]} wrap={false}>
        <View style={{ width: 200 }}>
          <Text style={{ borderTopWidth: 0.5, borderTopColor: "#555", paddingTop: 3 }}>
            Received by (consignee) — name, signature, date
          </Text>
        </View>
        <View style={{ width: 200, alignItems: "center" }}>
          <Text>For {d.orgName}</Text>
          <Text
            style={{ marginTop: 26, borderTopWidth: 0.5, borderTopColor: "#555", paddingTop: 3, width: 180, textAlign: "center" }}
          >
            Authorised signatory
          </Text>
        </View>
      </View>
      <Text
        style={[s.muted, { position: "absolute", bottom: 16, left: 30, fontSize: 7 }]}
        fixed
        render={() => `${d.number ?? "Draft challan"} · ${copy}`}
      />
    </Page>
  );
}

export async function renderChallanPdf(d: ChallanPdfData): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`Delivery challan ${d.number ?? "draft"}`} author={d.orgName}>
      {d.copies.map((c) => (
        <ChallanCopy key={c} d={d} copy={c} />
      ))}
    </Document>,
  );
}

async function loadChallan(organizationId: string, id: string, plantIds: "ALL" | readonly string[]) {
  const db = tenantDb({ organizationId, actorId: null, plantIds, ip: null });
  const c = await db.deliveryChallan.findUniqueOrThrow({
    where: { id },
    include: {
      plant: true,
      vendor: true,
      po: { select: { number: true } },
      items: { orderBy: { createdAt: "asc" }, include: { instrument: { select: { code: true } } } },
    },
  });
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, gstin: true, settings: true },
  });
  return { c, org };
}

export async function renderChallanPdfById(organizationId: string, id: string, plantIds: "ALL" | readonly string[] = "ALL") {
  const { c, org } = await loadChallan(organizationId, id, plantIds);
  const data: ChallanPdfData = {
    number: c.number,
    date: c.date,
    status: c.status,
    poNumber: c.po.number,
    consignor: {
      name: `${org.name} — ${c.plant.name}`,
      address: c.plant.address,
      gstin: c.consignorGstin,
      stateCode: c.plant.stateCode,
    },
    consignee: { name: c.vendor.name, address: c.vendor.address, gstin: c.consigneeGstin, stateCode: c.vendor.stateCode },
    placeOfSupply: c.placeOfSupply,
    transport: {
      mode: c.transportMode,
      vehicleNo: c.vehicleNo,
      courierName: c.courierName,
      awbNo: c.awbNo,
      ewayBillNo: c.ewayBillNo,
    },
    expectedReturnAt: c.expectedReturnAt,
    items: c.items.map((i) => ({
      code: i.instrument.code,
      description: i.description,
      hsnCode: i.hsnCode,
      qty: i.qty,
      value: i.value.toNumber(),
    })),
    copies: challanCopies(parseOrgSettings(org.settings).challanCopies),
    orgName: org.name,
  };
  return { buffer: await renderChallanPdf(data), fileName: `${(c.number ?? "draft-challan").replace(/\//g, "-")}.pdf` };
}

export async function renderGatePassPdfById(organizationId: string, id: string, plantIds: "ALL" | readonly string[] = "ALL") {
  const { c, org } = await loadChallan(organizationId, id, plantIds);
  if (!c.gatePassNo) throw new Error("Not dispatched");
  const buffer = await renderToBuffer(
    <Document title={`Gate pass ${c.gatePassNo}`}>
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
          <View>
            <Text style={s.h1}>GATE PASS — RETURNABLE</Text>
            <Text style={s.muted}>
              {org.name} — {c.plant.name}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.bold}>No. {c.gatePassNo}</Text>
            <Text>{formatDateTime(c.dispatchedAt)}</Text>
          </View>
        </View>
        <Text>
          <Text style={s.bold}>Delivery challan: </Text>
          {c.number} · <Text style={s.bold}>To: </Text>
          {c.vendor.name}
        </Text>
        <Text>
          <Text style={s.bold}>Transport: </Text>
          {[c.transportMode ? TRANSPORT[c.transportMode] : null, c.vehicleNo, c.courierName, c.awbNo && `AWB ${c.awbNo}`]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Text>
        <Text style={{ marginBottom: 6 }}>
          <Text style={s.bold}>Expected back: </Text>
          {formatDate(c.expectedReturnAt)}
        </Text>
        {c.items.map((i, idx) => (
          <Text key={i.id}>
            {idx + 1}. {i.instrument.code} — {i.description}
          </Text>
        ))}
        <View style={[s.row, { justifyContent: "space-between", marginTop: 30 }]}>
          {["Issued by (stores)", "Checked by (security)", "Carried by"].map((l) => (
            <Text key={l} style={{ width: 150, borderTopWidth: 0.5, borderTopColor: "#555", paddingTop: 3, textAlign: "center" }}>
              {l}
            </Text>
          ))}
        </View>
      </Page>
    </Document>,
  );
  return { buffer, fileName: `${c.gatePassNo.replace(/\//g, "-")}.pdf` };
}
