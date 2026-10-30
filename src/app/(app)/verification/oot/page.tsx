import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { OOT_TONE, StatusPill } from "@/components/data/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";

export const metadata: Metadata = { title: "OOT cases" };

export default async function OotListPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const all = show === "all";
  const ctx = await requireAnyPermission("certificate.verify", "oot.decide");
  const t = await getTranslations("oot");
  const db = tenantDb(ctx.tenant);
  const cases = await db.ootCase.findMany({
    where: { ...(ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {}), ...(all ? {} : { status: { not: "CLOSED" } }) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      instrument: { select: { code: true, description: true, type: { select: { name: true } } } },
      job: { select: { certificateNo: true, vendor: { select: { name: true } } } },
    },
  });
  const ts = await getTranslations("ootStatus");
  const td = await getTranslations("ootDisposition");
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <nav className="flex gap-3 text-sm" aria-label={t("status")}>
          <Link
            href="/verification/oot"
            aria-current={!all ? "page" : undefined}
            className={!all ? "font-medium underline underline-offset-4" : "text-muted-foreground hover:underline"}
          >
            {t("open")}
          </Link>
          <Link
            href="/verification/oot?show=all"
            aria-current={all ? "page" : undefined}
            className={all ? "font-medium underline underline-offset-4" : "text-muted-foreground hover:underline"}
          >
            {t("all")}
          </Link>
        </nav>
      </div>
      {cases.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("empty")} body={t("emptyBody")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="oot-cases">
            <TableHeader>
              <TableRow>
                <TableHead>{t("instrument")}</TableHead>
                <TableHead>{t("trigger")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("disposition")}</TableHead>
                <TableHead>{t("opened")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/verification/oot/${c.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                      {c.instrument.code}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {[c.instrument.type.name, c.job.vendor?.name, c.job.certificateNo].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{t(c.trigger)}</TableCell>
                  <TableCell>
                    <StatusPill label={ts(c.status)} tone={OOT_TONE[c.status]} />
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{c.disposition ? td(c.disposition) : "—"}</TableCell>
                  <TableCell>{formatDate(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
