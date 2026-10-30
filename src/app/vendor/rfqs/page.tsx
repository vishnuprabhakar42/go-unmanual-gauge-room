import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { RFQ_TONE, StatusPill } from "@/components/data/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/domain/india/format";
import { requireVendorContext } from "@/server/vendor-portal/context";
import { portalRfqs } from "@/server/vendor-portal/data";

export default async function PortalRfqs() {
  const ctx = await requireVendorContext();
  const t = await getTranslations();
  const rows = await portalRfqs(ctx);
  return (
    <>
      <PageHeader title={t("portal.rfqs")} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("portal.noRfqs")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="portal-rfqs">
            <TableHeader>
              <TableRow>
                <TableHead>{t("rfqs.number")}</TableHead>
                <TableHead>{t("portal.customer")}</TableHead>
                <TableHead>{t("portal.due")}</TableHead>
                <TableHead>{t("portal.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const quoted = r.rfq.quotes.some((q) => q.vendorId === r.vendorId);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/vendor/rfqs/${r.rfq.id}`}
                        className="font-mono font-medium underline-offset-4 hover:underline"
                      >
                        {r.rfq.number}
                      </Link>
                    </TableCell>
                    <TableCell>{r.rfq.organization.name}</TableCell>
                    <TableCell>{formatDate(r.rfq.dueAt)}</TableCell>
                    <TableCell className="space-x-1">
                      <StatusPill label={t(`rfqStatus.${r.rfq.status}`)} tone={RFQ_TONE[r.rfq.status]} />
                      <StatusPill
                        label={quoted ? t("portal.quoted") : t("portal.notQuoted")}
                        tone={quoted ? "success" : "warning"}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
