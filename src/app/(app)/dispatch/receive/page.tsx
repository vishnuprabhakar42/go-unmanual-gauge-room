import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { daysSince, daysUntilDue } from "@/domain/due";
import { formatDate } from "@/domain/india/format";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { ScanBox } from "./scan-box";

export const metadata: Metadata = { title: "Receive" };

export default async function ReceivePage() {
  const ctx = await requirePermission("receipt.manage");
  const t = await getTranslations("dispatch");
  const pending = await tenantDb(ctx.tenant).deliveryChallanItem.findMany({
    where: {
      returnedAt: null,
      challan: {
        dispatchedAt: { not: null },
        status: { in: ["ISSUED", "PARTIALLY_RETURNED"] },
        ...(ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {}),
      },
    },
    include: {
      instrument: { select: { code: true, type: { select: { name: true } } } },
      challan: {
        select: { id: true, number: true, dispatchedAt: true, expectedReturnAt: true, vendor: { select: { name: true } } },
      },
    },
    orderBy: [{ challan: { dispatchedAt: "asc" } }],
    take: 500,
  });
  return (
    <div className="space-y-6">
      <ScanBox />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("pendingTitle")} ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noPending")}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table data-testid="pending-returns">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("code")}</TableHead>
                    <TableHead>{t("vendor")}</TableHead>
                    <TableHead>{t("number")}</TableHead>
                    <TableHead>{t("expectedReturn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((p) => {
                    const overdueDays = p.challan.expectedReturnAt ? -daysUntilDue(p.challan.expectedReturnAt) : 0;
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-mono font-medium">{p.instrument.code}</div>
                          <div className="text-muted-foreground text-xs">{p.instrument.type.name}</div>
                        </TableCell>
                        <TableCell>
                          {p.challan.vendor.name}
                          <div className="text-muted-foreground text-xs">
                            {t("daysOut", { days: p.challan.dispatchedAt ? daysSince(p.challan.dispatchedAt) : 0 })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/dispatch/challans/${p.challan.id}`}
                            className="font-mono underline-offset-4 hover:underline"
                          >
                            {p.challan.number}
                          </Link>
                        </TableCell>
                        <TableCell className={overdueDays > 0 ? "font-medium text-red-700 dark:text-red-400" : undefined}>
                          {formatDate(p.challan.expectedReturnAt)}
                          {overdueDays > 0 && <div className="text-xs">{t("overdueBy", { days: overdueDays })}</div>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
