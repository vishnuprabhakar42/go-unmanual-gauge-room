import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { daysUntilDue } from "@/domain/due";
import { formatDate } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { overdueReturns } from "@/server/services/challans";
import { tenantDb } from "@/server/tenant";

export const metadata: Metadata = { title: "Overdue returns" };

export default async function OverduePage() {
  const ctx = await requireAnyPermission("dispatch.manage", "receipt.manage");
  const t = await getTranslations("dispatch");
  const rows = await overdueReturns(tenantDb(ctx.tenant), { plantId: ctx.currentPlantId });
  if (!rows.length) return <p className="text-muted-foreground text-sm">{t("overdueEmpty")}</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="overdue-returns">
        <TableHeader>
          <TableRow>
            <TableHead>{t("code")}</TableHead>
            <TableHead>{t("vendor")}</TableHead>
            <TableHead>{t("number")}</TableHead>
            <TableHead>{t("dispatchedAt")}</TableHead>
            <TableHead>{t("expectedReturn")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link
                  href={`/instruments/${r.instrument.id}`}
                  className="font-mono font-medium underline-offset-4 hover:underline"
                >
                  {r.instrument.code}
                </Link>
                <div className="text-muted-foreground text-xs">{r.instrument.type.name}</div>
              </TableCell>
              <TableCell>{r.challan.vendor.name}</TableCell>
              <TableCell>
                <Link href={`/dispatch/challans/${r.challan.id}`} className="font-mono underline-offset-4 hover:underline">
                  {r.challan.number}
                </Link>
              </TableCell>
              <TableCell>{formatDate(r.challan.dispatchedAt)}</TableCell>
              <TableCell className="font-medium text-red-700 dark:text-red-400">
                {formatDate(r.challan.expectedReturnAt)}
                <div className="text-xs">
                  {t("overdueBy", { days: r.challan.expectedReturnAt ? -daysUntilDue(r.challan.expectedReturnAt) : 0 })}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
