import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

/** Demo-only: a realistic-looking NABL calibration certificate PDF for seeded verification jobs. */
export type DemoCertificate = {
  lab: { name: string; address: string; accreditationNo: string };
  certificateNo: string;
  ulrNo: string;
  customer: string;
  instrument: { description: string; code: string; serialNo: string; make: string | null; range: string };
  receivedOn: string;
  calibratedOn: string;
  nextDue: string;
  readings: { nominal: number; asFound: number | null; asLeft: number; permissible: number; uncertainty: number }[];
  unit: string;
  reference?: string;
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#555" },
  row: { flexDirection: "row" },
  th: { fontFamily: "Helvetica-Bold", backgroundColor: "#eee", padding: 4, flex: 1, textAlign: "right" },
  td: { padding: 4, flex: 1, textAlign: "right", borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  kv: { flexDirection: "row", marginBottom: 2 },
  k: { width: 140, color: "#555" },
  nabl: {
    borderWidth: 1.5,
    borderColor: "#1d4ed8",
    color: "#1d4ed8",
    padding: 6,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    width: 90,
  },
});

const f = (n: number | null) => (n == null ? "—" : n.toFixed(3));

export function renderDemoCertificate(c: DemoCertificate): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`Calibration certificate ${c.certificateNo}`}>
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 14 }]}>
          <View>
            <Text style={[s.bold, { fontSize: 14 }]}>{c.lab.name}</Text>
            <Text style={s.muted}>{c.lab.address}</Text>
          </View>
          <View style={s.nabl}>
            <Text>NABL</Text>
            <Text style={{ fontSize: 7 }}>{c.lab.accreditationNo}</Text>
          </View>
        </View>
        <Text style={[s.bold, { fontSize: 13, textAlign: "center", marginBottom: 10 }]}>CALIBRATION CERTIFICATE</Text>
        {[
          ["Certificate No.", c.certificateNo],
          ["ULR No.", c.ulrNo],
          ["Customer", c.customer],
          ["Instrument", c.instrument.description],
          ["ID / Code", c.instrument.code],
          ["Serial No.", c.instrument.serialNo],
          ["Make", c.instrument.make ?? "—"],
          ["Range", c.instrument.range],
          ["Date of receipt", c.receivedOn],
          ["Date of calibration", c.calibratedOn],
          ["Recommended next due", c.nextDue],
          ["Environment", "23 ± 2 °C, 50 ± 10 % RH"],
          ["Reference standard", c.reference ?? "Digital pressure calibrator DPC-700, traceable to NPL India"],
        ].map(([k, v]) => (
          <View key={k} style={s.kv}>
            <Text style={s.k}>{k}</Text>
            <Text>{v}</Text>
          </View>
        ))}
        <Text style={[s.bold, { marginTop: 12, marginBottom: 4 }]}>Results ({c.unit})</Text>
        <View style={s.row}>
          {["Nominal", "As found", "As left", "Error", "Permissible ±", "Uncertainty (k=2)"].map((h) => (
            <Text key={h} style={s.th}>
              {h}
            </Text>
          ))}
        </View>
        {c.readings.map((r) => (
          <View key={r.nominal} style={s.row}>
            <Text style={s.td}>{f(r.nominal)}</Text>
            <Text style={s.td}>{f(r.asFound)}</Text>
            <Text style={s.td}>{f(r.asLeft)}</Text>
            <Text style={s.td}>{f(r.asLeft - r.nominal)}</Text>
            <Text style={s.td}>{f(r.permissible)}</Text>
            <Text style={s.td}>{f(r.uncertainty)}</Text>
          </View>
        ))}
        <Text style={[s.muted, { marginTop: 10 }]}>
          The reported expanded uncertainty is stated as the standard uncertainty multiplied by the coverage factor k=2,
          corresponding to a confidence level of approximately 95%. Results relate only to the item calibrated.
        </Text>
        <View style={[s.row, { justifyContent: "space-between", marginTop: 40 }]}>
          <Text>Calibrated by: R. Patil</Text>
          <Text>Authorised signatory: S. Kale</Text>
        </View>
      </Page>
    </Document>,
  );
}
