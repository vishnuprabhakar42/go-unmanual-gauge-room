import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { formatDate, toDateInput } from "@/domain/india/format";
import { requireVendorContext } from "@/server/vendor-portal/context";
import { portalRfq } from "@/server/vendor-portal/data";
import { QuoteGrid } from "./quote-grid";

export default async function PortalRfq({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireVendorContext();
  const t = await getTranslations("portal");
  const view = await portalRfq(ctx, id);
  if (!view) notFound();
  const { rfq, items, quote, plant } = view;
  const n = (d: { toNumber(): number } | null) => (d == null ? null : d.toNumber());
  return (
    <>
      <PageHeader
        title={t("rfqTitle", { number: rfq.number })}
        subtitle={t("rfqFrom", { org: rfq.organization.name, plant: plant.name, due: formatDate(rfq.dueAt) })}
      />
      <QuoteGrid
        rfqId={rfq.id}
        open={rfq.status === "OPEN"}
        hasQuote={!!quote}
        validUntil={toDateInput(quote?.validUntil)}
        remarks={quote?.remarks ?? ""}
        items={items.map((i) => {
          const line = quote?.items.find((q) => q.requestItemId === i.id);
          const range =
            n(i.instrument.rangeMin) != null && n(i.instrument.rangeMax) != null
              ? `${n(i.instrument.rangeMin)}–${n(i.instrument.rangeMax)} ${i.instrument.unit ?? ""}`
              : null;
          return {
            id: i.id,
            code: i.instrument.code,
            details: [
              i.instrument.type.name,
              range,
              i.instrument.make,
              n(i.instrument.leastCount) != null ? `LC ${n(i.instrument.leastCount)}` : null,
              i.instrument.nablRequired ? "NABL" : null,
            ]
              .filter(Boolean)
              .join(" · "),
            rate: line ? String(line.rate.toNumber()) : "",
            gstPercent: line ? String(line.gstPercent.toNumber()) : "18",
            tatDays: line ? String(line.tatDays) : "7",
            nablInScope: line?.nablInScope ?? true,
          };
        })}
      />
    </>
  );
}
