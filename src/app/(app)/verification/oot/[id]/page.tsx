import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OOT_TONE, StatusPill } from "@/components/data/status-pill";
import { StatusBadge } from "@/components/instruments/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, toDateInput } from "@/domain/india/format";
import { allowedDispositions } from "@/domain/oot";
import { requireAnyPermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { OotWorkflow } from "./oot-workflow";

export const metadata: Metadata = { title: "OOT case" };

export default async function OotCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAnyPermission("certificate.verify", "oot.decide");
  const t = await getTranslations("oot");
  const tv = await getTranslations("verification");
  const ts = await getTranslations("ootStatus");
  const td = await getTranslations("ootDisposition");
  const db = tenantDb(ctx.tenant);
  const c = await db.ootCase.findUnique({
    where: { id },
    include: {
      instrument: {
        select: {
          id: true,
          code: true,
          status: true,
          description: true,
          unit: true,
          type: { select: { name: true } },
          department: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
      job: {
        select: {
          certificateNo: true,
          ulrNo: true,
          calibratedAt: true,
          certificateFileId: true,
          verifiedAt: true,
          verifiedById: true,
          vendor: { select: { name: true } },
          readings: { orderBy: { position: "asc" } },
        },
      },
    },
  });
  if (!c) notFound();
  const userIds = [c.decidedById, c.job.verifiedById].filter((x): x is string => !!x);
  const users = new Map(
    (await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })).map((u) => [
      u.id,
      u.name ?? u.email,
    ]),
  );
  const n = (d: { toString(): string } | null) => (d == null ? "—" : d.toString());

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-muted-foreground text-sm">
          <Link href="/verification/oot" className="hover:underline">
            {t("title")}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("caseTitle", { code: c.instrument.code })}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill label={ts(c.status)} tone={OOT_TONE[c.status]} />
          <StatusBadge status={c.instrument.status} />
          <span className="text-muted-foreground">
            {t(c.trigger)} ·{" "}
            {[c.instrument.type.name, c.instrument.department?.name, c.instrument.location?.name].filter(Boolean).join(" · ")} ·{" "}
            {t("opened")} {formatDate(c.createdAt)}
          </span>
        </div>
        {c.trigger === "AS_FOUND_FAIL" && <p className="text-muted-foreground text-sm">{t("asFoundNote")}</p>}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("certificate")}</CardTitle>
          <div className="flex gap-3 text-sm">
            {c.job.certificateFileId && (
              <a
                href={`/api/attachments/${c.job.certificateFileId}`}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {tv("openPdf")}
              </a>
            )}
            <Link href={`/instruments/${c.instrument.id}`} className="underline-offset-4 hover:underline">
              {c.instrument.code}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {c.job.vendor?.name ?? tv("inHouse")} · {c.job.certificateNo} {c.job.ulrNo && `· ${c.job.ulrNo}`} ·{" "}
            {tv("calibratedAt")} {formatDate(c.job.calibratedAt)} · {tv("verifiedBy")}{" "}
            {users.get(c.job.verifiedById ?? "") ?? "—"}
          </p>
          {c.job.readings.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table data-testid="oot-readings">
                <TableHeader>
                  <TableRow>
                    <TableHead>{tv("point")}</TableHead>
                    <TableHead className="text-right">{tv("nominal")}</TableHead>
                    <TableHead className="text-right">{tv("asFound")}</TableHead>
                    <TableHead className="text-right">{tv("asLeft")}</TableHead>
                    <TableHead className="text-right">{tv("error")}</TableHead>
                    <TableHead className="text-right">{tv("permissible")}</TableHead>
                    <TableHead>{tv("result")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.job.readings.map((r) => (
                    <TableRow
                      key={r.id}
                      className={!r.pass || r.asFoundPass === false ? "bg-red-50 dark:bg-red-950/40" : undefined}
                    >
                      <TableCell>{r.pointLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(r.nominal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(r.asFound)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(r.asLeft)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{n(r.error)}</TableCell>
                      <TableCell className="text-right tabular-nums">±{n(r.permissibleError)}</TableCell>
                      <TableCell className="text-sm">
                        {r.pass ? tv("pass") : tv("fail")}
                        {r.asFoundPass === false && ` · ${tv("asFound")} ${tv("fail").toLowerCase()}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <OotWorkflow
        id={c.id}
        status={c.status}
        initial={{
          lastGoodCalibrationAt: toDateInput(c.lastGoodCalibrationAt),
          impactNotes: c.impactNotes ?? "",
          affectedProducts: c.affectedProducts ?? "",
        }}
        dispositions={allowedDispositions(c.trigger).map((d) => ({ value: d, label: td(d) }))}
        decided={
          c.disposition
            ? {
                label: td(c.disposition),
                notes: c.dispositionNotes ?? "",
                by: t("decidedBy", { name: users.get(c.decidedById ?? "") ?? "—", date: formatDate(c.decidedAt) }),
              }
            : null
        }
        closed={c.closedAt ? { on: t("closedOn", { date: formatDate(c.closedAt) }), capa: c.capaRef } : null}
        can={{
          assess: ctx.can("certificate.verify", c.plantId) || ctx.can("oot.decide", c.plantId),
          decide: ctx.can("oot.decide", c.plantId),
        }}
      />
    </div>
  );
}
