import { ClipboardCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { RESULT_TONE, StatusPill } from "@/components/data/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/domain/india/format";
import { requireAnyPermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { ReprintPrompt } from "./reprint-prompt";

export const metadata: Metadata = { title: "Verification" };

const DAY = 86_400_000;

export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ reprint?: string; code?: string }>;
}) {
  const { reprint, code } = await searchParams;
  const ctx = await requireAnyPermission("certificate.verify", "oot.decide");
  const t = await getTranslations("verification");
  const db = tenantDb(ctx.tenant);
  const plant = ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {};
  const [queue, recent] = await Promise.all([
    db.calibrationJob.findMany({
      where: { ...plant, status: "CERT_UPLOADED", certificateFileId: { not: null } },
      orderBy: { receivedAt: "asc" },
      take: 200,
      include: {
        instrument: { select: { code: true, description: true, type: { select: { name: true } } } },
        vendor: { select: { name: true } },
        poItem: { select: { po: { select: { number: true } } } },
      },
    }),
    db.calibrationJob.findMany({
      where: { ...plant, verifiedAt: { not: null } },
      orderBy: { verifiedAt: "desc" },
      take: 10,
      include: { instrument: { select: { code: true } }, vendor: { select: { name: true } } },
    }),
  ]);
  const verifiers = await db.user.findMany({
    where: { id: { in: [...new Set(recent.map((r) => r.verifiedById!))] } },
    select: { id: true, name: true, email: true },
  });
  const who = new Map(verifiers.map((u) => [u.id, u.name ?? u.email]));
  const now = new Date();

  return (
    <div className="space-y-6">
      {reprint && code && <ReprintPrompt key={reprint} instrumentId={reprint} code={code} />}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      {queue.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={t("empty")} body={t("emptyBody")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="verification-queue">
            <TableHeader>
              <TableRow>
                <TableHead>{t("instrument")}</TableHead>
                <TableHead>{t("lab")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("po")}</TableHead>
                <TableHead>{t("received")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("waiting")}</TableHead>
                <TableHead className="sr-only">{t("verify")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((j) => {
                const days = j.receivedAt ? Math.floor((now.getTime() - j.receivedAt.getTime()) / DAY) : null;
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <div className="font-mono font-medium">{j.instrument.code}</div>
                      <div className="text-muted-foreground text-xs">
                        {[j.instrument.type.name, j.instrument.description].filter(Boolean).join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell>
                      {j.vendor?.name ?? t("inHouse")}
                      {j.aiExtraction != null && (
                        <span className="text-muted-foreground ml-2 inline-flex items-center gap-1 text-xs">
                          <Sparkles className="size-3" aria-hidden="true" />
                          {t("aiRead")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden font-mono text-sm md:table-cell">{j.poItem?.po.number ?? "—"}</TableCell>
                    <TableCell>{formatDate(j.receivedAt)}</TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">{days == null ? "—" : `${days} d`}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm">
                        <Link href={`/verification/${j.id}`} aria-label={`${t("verify")} ${j.instrument.code}`}>
                          {t("verify")}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("recent")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm" data-testid="recent-verifications">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono font-medium">{r.instrument.code}</span>
                  {r.result && <StatusPill label={t(r.result)} tone={RESULT_TONE[r.result]} />}
                  <span className="text-muted-foreground">
                    {r.vendor?.name ?? t("inHouse")} · {r.certificateNo} · {who.get(r.verifiedById!) ?? "—"} ·{" "}
                    {formatDateTime(r.verifiedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
