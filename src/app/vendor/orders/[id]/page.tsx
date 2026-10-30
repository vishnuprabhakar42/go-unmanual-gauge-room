import { FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { PO_TONE, StatusPill } from "@/components/data/status-pill";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/domain/india/format";
import { requireVendorContext } from "@/server/vendor-portal/context";
import { portalOrder } from "@/server/vendor-portal/data";
import { AcknowledgeButton } from "./acknowledge";

export default async function PortalOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireVendorContext();
  const t = await getTranslations();
  const po = await portalOrder(ctx, id);
  if (!po) notFound();
  return (
    <>
      <PageHeader
        title={t("portal.poTitle", { number: po.number })}
        subtitle={`${po.organization.name} · ${po.plant.name} · ${formatDate(po.sentAt)}`}
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <a href={`/api/vendor/orders/${po.id}/pdf`} target="_blank" rel="noreferrer" data-testid="portal-po-pdf">
                <FileText className="size-4" />
                {t("portal.pdf")}
              </a>
            </Button>
            {po.status === "SENT" && <AcknowledgeButton poId={po.id} />}
          </>
        }
      />
      <div className="mb-4 flex items-center gap-3 text-sm">
        <StatusPill label={t(`poStatus.${po.status}`)} tone={PO_TONE[po.status]} />
        <span>
          {t("portal.total")}: <span className="font-semibold tabular-nums">{formatINR(po.total.toNumber())}</span>
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("pos.instrument")}</TableHead>
              <TableHead>{t("pos.description")}</TableHead>
              <TableHead className="text-right">{t("pos.tat")}</TableHead>
              <TableHead className="text-right">{t("pos.rate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono">
                  {i.instrument.code}
                  {i.instrument.serialNo && (
                    <div className="text-muted-foreground font-sans text-xs">S/N {i.instrument.serialNo}</div>
                  )}
                </TableCell>
                <TableCell>{i.description}</TableCell>
                <TableCell className="text-right tabular-nums">{i.tatDays}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(i.rate.toNumber())}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
