import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { indexPagesOf, type IndexEntry } from "@/domain/audit-pack";

/**
 * Audit pack documents (react-pdf). Page footers ("page X of Y") are stamped later by pdf-lib on the merged
 * file, so every page here leaves a bottom margin. Index rows have a fixed height (one line, truncated) so the
 * index occupies exactly the number of pages the layout planned.
 */
const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 40, paddingHorizontal: 32, fontSize: 8, fontFamily: "Helvetica", color: "#111" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: "#555" },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  head: { flexDirection: "row", backgroundColor: "#eee", fontFamily: "Helvetica-Bold" },
  cell: { paddingVertical: 3, paddingHorizontal: 2 },
  bad: { backgroundColor: "#fde2e2" },
  ok: { backgroundColor: "#e3f6ea", padding: 8, marginTop: 6 },
  warn: { backgroundColor: "#fde2e2", padding: 8, marginTop: 6, marginBottom: 6 },
  kv: { flexDirection: "row", marginBottom: 3 },
  indexRow: {
    flexDirection: "row",
    height: 16,
    overflow: "hidden",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
});

/** Helvetica (WinAnsi) can't draw every Unicode character: keep Latin-1 + common punctuation. */
export const safe = (v: string | null | undefined) => (v ?? "").replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, "?");

const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

export type Column<R> = { header: string; width: number; value: (r: R) => string; align?: "left" | "right" };

export type SectionDoc<R> = {
  number: number;
  title: string;
  subtitle: string;
  columns: Column<R>[];
  rows: R[];
  rowIsBad?: (r: R) => boolean;
  /** shown above the table */
  notice?: { tone: "ok" | "warn"; text: string };
  empty: string;
  landscape?: boolean;
};

export function renderSection<R>(d: SectionDoc<R>): Promise<Buffer> {
  return renderToBuffer(
    <Document title={d.title}>
      <Page size="A4" orientation={d.landscape ? "landscape" : "portrait"} style={s.page} wrap>
        <View fixed style={{ marginBottom: 8 }}>
          <Text style={s.h2}>
            {d.number}. {safe(d.title)}
          </Text>
          <Text style={s.muted}>{safe(d.subtitle)}</Text>
        </View>
        {d.notice && (
          <View style={d.notice.tone === "ok" ? s.ok : s.warn}>
            <Text style={s.bold}>{safe(d.notice.text)}</Text>
          </View>
        )}
        {d.rows.length === 0 ? (
          <Text style={{ marginTop: 8 }}>{safe(d.empty)}</Text>
        ) : (
          <View>
            <View style={s.head} fixed>
              {d.columns.map((c) => (
                <Text key={c.header} style={[s.cell, { width: `${c.width}%`, textAlign: c.align ?? "left" }]}>
                  {c.header}
                </Text>
              ))}
            </View>
            {d.rows.map((r, i) => (
              <View key={i} style={[s.row, d.rowIsBad?.(r) ? s.bad : {}]} wrap={false}>
                {d.columns.map((c) => (
                  <Text key={c.header} style={[s.cell, { width: `${c.width}%`, textAlign: c.align ?? "left" }]}>
                    {safe(c.value(r))}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>,
  );
}

export type FrontData = {
  orgName: string;
  orgAddress: string | null;
  plant: string;
  period: string;
  generatedAt: string;
  generatedBy: string;
  summary: [label: string, value: string][];
  entries: IndexEntry[];
};

/** Cover page + index pages (exactly `indexPagesOf(entries).length`). */
export function renderFront(d: FrontData): Promise<Buffer> {
  const pages = indexPagesOf(d.entries);
  return renderToBuffer(
    <Document title={`Audit pack — ${d.plant} — ${d.period}`}>
      <Page size="A4" style={s.page}>
        <View style={{ marginTop: 120 }}>
          <Text style={[s.muted, { fontSize: 10, marginBottom: 8 }]}>
            IATF 16949 / ISO 9001 clause 7.1.5 — Monitoring and measuring resources
          </Text>
          <Text style={s.h1}>Calibration audit pack</Text>
          <Text style={{ fontSize: 14, marginBottom: 4 }}>{safe(d.orgName)}</Text>
          {d.orgAddress && <Text style={[s.muted, { marginBottom: 16 }]}>{safe(d.orgAddress)}</Text>}
          <View style={s.kv}>
            <Text style={[s.muted, { width: 120 }]}>Plant</Text>
            <Text>{safe(d.plant)}</Text>
          </View>
          <View style={s.kv}>
            <Text style={[s.muted, { width: 120 }]}>Period</Text>
            <Text>{d.period}</Text>
          </View>
          <View style={s.kv}>
            <Text style={[s.muted, { width: 120 }]}>Generated</Text>
            <Text>
              {d.generatedAt} by {safe(d.generatedBy)}
            </Text>
          </View>
          <View style={{ marginTop: 24, borderTopWidth: 0.5, borderTopColor: "#999", paddingTop: 12 }}>
            {d.summary.map(([k, v]) => (
              <View key={k} style={s.kv}>
                <Text style={[s.muted, { width: 220 }]}>{k}</Text>
                <Text style={s.bold}>{v}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.muted, { marginTop: 40 }]}>
            Generated by Go Unmanual Gauge Room from the live calibration records. Register and overdue status are as at the end
            of the period (or today, if earlier); certificates are the verified certificates of calibrations in the period.
          </Text>
        </View>
      </Page>
      {pages.map((chunk, p) => (
        <Page key={p} size="A4" style={s.page}>
          <Text style={[s.h2, { height: 22 }]}>{p === 0 ? "Index" : "Index (continued)"}</Text>
          {chunk.map((e, i) => (
            <View key={i} style={s.indexRow}>
              <Text
                style={[
                  { flexGrow: 1, flexBasis: 0, paddingLeft: e.kind === "certificate" ? 14 : 0 },
                  e.kind === "certificate" ? {} : s.bold,
                ]}
              >
                {clip(safe(e.detail ? `${e.label}  ·  ${e.detail}` : e.label), 100)}
              </Text>
              <Text style={{ width: 40, textAlign: "right" }}>{e.page}</Text>
            </View>
          ))}
        </Page>
      ))}
    </Document>,
  );
}
