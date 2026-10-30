import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { PO_TONE, StatusPill } from "@/components/data/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/domain/india/format";
import { requireVendorContext } from "@/server/vendor-portal/context";
import { portalOrders } from "@/server/vendor-portal/data";

export default async function PortalOrders() {
  const ctx = await requireVendorContext();
  const t = await getTranslations();
  const rows = await portalOrders(ctx);
  return (
    <>
      <PageHeader title={t("portal.orders")} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("portal.noOrders")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="portal-orders">
            <TableHeader>
              <TableRow>
                <TableHead>{t("pos.number")}</TableHead>
                <TableHead>{t("portal.customer")}</TableHead>
                <TableHead>{t("pos.status")}</TableHead>
                <TableHead className="text-right">{t("pos.total")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("pos.date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/vendor/orders/${o.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                      {o.number}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {t("dashboard.instrumentsCount", { count: o._count.items })}
                    </div>
                  </TableCell>
                  <TableCell>
                    {o.organization.name}
                    <div className="text-muted-foreground text-xs">{o.plant.name}</div>
                  </TableCell>
                  <TableCell>
                    <StatusPill label={t(`poStatus.${o.status}`)} tone={PO_TONE[o.status]} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(o.total.toNumber())}</TableCell>
                  <TableCell className="hidden sm:table-cell">{formatDate(o.sentAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
