import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { formatDate } from "@/domain/india/format";

/** QR label PDFs. "roll" = one label per page (thermal label printers); "a4" = grid of labels on A4 sheets. */
export type LabelSize = "50x25" | "38x25";
export type LabelLayout = "roll" | "a4";
export type LabelData = { code: string; title: string; lastCalibratedAt: Date | null; nextDueAt: Date | null; url: string };

const MM = 72 / 25.4;
const PAD = 1.5;
const GAP = 1.5;
const DIMENSIONS: Record<LabelSize, { w: number; h: number; qr: number; font: number; codeFont: number }> = {
  "50x25": { w: 50, h: 25, qr: 21, font: 6, codeFont: 8.5 },
  "38x25": { w: 38, h: 25, qr: 16, font: 5, codeFont: 6.5 },
};

function styles(size: LabelSize) {
  const d = DIMENSIONS[size];
  return StyleSheet.create({
    label: {
      width: d.w * MM,
      height: d.h * MM,
      padding: PAD * MM,
      flexDirection: "row",
      alignItems: "center",
      gap: GAP * MM,
      overflow: "hidden",
    },
    qr: { width: d.qr * MM, height: d.qr * MM },
    text: { width: (d.w - 2 * PAD - d.qr - GAP) * MM, justifyContent: "center", gap: 0.5 * MM },
    code: { fontSize: d.codeFont, fontFamily: "Helvetica-Bold" },
    line: { fontSize: d.font, fontFamily: "Helvetica" },
    title: { fontSize: d.font, fontFamily: "Helvetica", maxLines: 2, textOverflow: "ellipsis" },
    due: { fontSize: d.font, fontFamily: "Helvetica-Bold" },
  });
}

function Label({ data, qr, size, cutLines }: { data: LabelData; qr: string; size: LabelSize; cutLines?: boolean }) {
  const s = styles(size);
  return (
    <View style={cutLines ? [s.label, { borderWidth: 0.3, borderColor: "#bbbbbb", borderStyle: "dashed" }] : s.label}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
      <Image src={qr} style={s.qr} />
      <View style={s.text}>
        <Text style={s.code}>{data.code}</Text>
        <Text style={s.title} hyphenationCallback={(w) => [w]}>
          {data.title}
        </Text>
        <Text style={s.line}>Cal: {formatDate(data.lastCalibratedAt) || "—"}</Text>
        <Text style={s.due}>Due: {formatDate(data.nextDueAt) || "—"}</Text>
      </View>
    </View>
  );
}

export async function renderLabelsPdf(labels: LabelData[], size: LabelSize, layout: LabelLayout): Promise<Buffer> {
  const SHEET_MARGIN_MM = 4;
  const qrs = await Promise.all(labels.map((l) => QRCode.toDataURL(l.url, { margin: 0, errorCorrectionLevel: "M", scale: 6 })));
  const d = DIMENSIONS[size];
  let doc: React.ReactElement<DocumentProps>;
  if (layout === "roll") {
    doc = (
      <Document title="Instrument labels">
        {labels.map((l, i) => (
          <Page key={l.code + i} size={[d.w * MM, d.h * MM]}>
            <Label data={l} qr={qrs[i]} size={size} />
          </Page>
        ))}
      </Document>
    );
  } else {
    const cols = Math.floor((210 - 2 * SHEET_MARGIN_MM) / d.w);
    const rows = Math.floor((297 - 2 * SHEET_MARGIN_MM) / d.h);
    const perPage = cols * rows;
    const pages: number[][] = [];
    for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage).map((_, j) => i + j));
    doc = (
      <Document title="Instrument labels">
        {pages.map((idx, p) => (
          <Page
            key={p}
            size="A4"
            style={{ padding: SHEET_MARGIN_MM * MM, flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start" }}
          >
            {idx.map((i) => (
              <Label key={i} data={labels[i]} qr={qrs[i]} size={size} cutLines />
            ))}
          </Page>
        ))}
      </Document>
    );
  }
  return renderToBuffer(doc);
}
