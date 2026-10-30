import { FileStack } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { PACK_TONE, StatusPill } from "@/components/data/status-pill";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, toDateInput } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { fyStart } from "@/server/services/reports";
import { tenantDb } from "@/server/tenant";
import { AuditPackForm, PackActions, RefreshWhileRunning } from "./audit-pack-client";

export const metadata: Metadata = { title: "Audit pack" };

export default async function AuditPackPage() {
  const ctx = await requireAnyPermission("report.view", "auditpack.generate");
  const t = await getTranslations("reports");
  const ts = await getTranslations("auditPackStatus");
  const db = tenantDb(ctx.tenant);
  const packs = await db.auditPack.findMany({
    where: ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { plant: { select: { code: true } } },
  });
  const users = new Map(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(packs.map((p) => p.requestedById))] } },
        select: { id: true, name: true, email: true },
      })
    ).map((u) => [u.id, u.name ?? u.email]),
  );
  const canGenerate = ctx.can("auditpack.generate");
  const now = new Date();
  const running = packs.some((p) => p.status === "QUEUED" || p.status === "RUNNING");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("packTitle")}</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">{t("packSubtitle")}</p>
      </div>
      {canGenerate && (
        <Card>
          <CardContent>
            <AuditPackForm
              plants={ctx.plants
                .filter((p) => ctx.can("auditpack.generate", p.id))
                .map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
              defaultPlant={ctx.currentPlantId ?? ctx.plants[0]?.id ?? ""}
              defaultFrom={toDateInput(fyStart(now))}
              defaultTo={toDateInput(now)}
            />
          </CardContent>
        </Card>
      )}
      <RefreshWhileRunning active={running} />
      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t("history")}</h2>
        {packs.length === 0 ? (
          <EmptyState icon={FileStack} title={t("noPacks")} body={t("noPacksBody")} />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="audit-packs">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("plant")}</TableHead>
                  <TableHead>{t("period")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("requested")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("pages")}</TableHead>
                  <TableHead className="sr-only">{t("download")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packs.map((p) => {
                  const st = p.stats as {
                    instruments: number;
                    calibrations: number;
                    certificates: number;
                    overdue: number;
                  } | null;
                  return (
                    <TableRow key={p.id} data-status={p.status}>
                      <TableCell className="font-mono">{p.plant.code}</TableCell>
                      <TableCell>
                        <div>
                          {formatDate(p.periodFrom)} – {formatDate(p.periodTo)}
                        </div>
                        {st && <div className="text-muted-foreground text-xs">{t("stats", st)}</div>}
                        {p.error && <div className="text-destructive text-xs">{p.error}</div>}
                      </TableCell>
                      <TableCell>
                        <StatusPill label={ts(p.status)} tone={PACK_TONE[p.status]} />
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">
                        {formatDateTime(p.createdAt)}
                        <div className="text-muted-foreground text-xs">{users.get(p.requestedById) ?? "—"}</div>
                      </TableCell>
                      <TableCell className="hidden tabular-nums lg:table-cell">{p.pageCount ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <PackActions id={p.id} status={p.status} fileId={p.fileId} canRetry={canGenerate} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
