import { RESULT_TONE, StatusPill } from "@/components/data/status-pill";
import { ArrowRightLeft, CheckCircle2, History, MapPin, Pencil, PlusCircle, Send, TriangleAlert, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { DueText, StatusBadge } from "@/components/instruments/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { daysUntilDue, dueStateFromPlanning } from "@/domain/due";
import { effectiveStandard } from "@/domain/standards";
import { formatDate, formatDateTime, formatINR } from "@/domain/india/format";
import { MANUAL_TRANSITIONS } from "@/domain/instrument-status";
import { parseOrgSettings } from "@/domain/settings";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { InstrumentActions } from "./instrument-actions";

export const metadata: Metadata = { title: "Instrument" };

const EVENT_ICON = {
  CREATED: PlusCircle,
  STATUS_CHANGED: ArrowRightLeft,
  SENT: Send,
  RECEIVED: CheckCircle2,
  CALIBRATED: Wrench,
  OOT: TriangleAlert,
  MOVED: MapPin,
  EDITED: Pencil,
} as const;

export default async function InstrumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("instrument.view");
  const t = await getTranslations();
  const db = tenantDb(ctx.tenant);
  const instrument = await db.instrument.findUnique({
    where: { id },
    include: { type: true, plant: true, department: true, location: { include: { parent: true } } },
  });
  if (!instrument) notFound();

  const [events, org, jobs] = await Promise.all([
    db.instrumentEvent.findMany({ where: { instrumentId: id }, orderBy: { at: "desc" }, take: 200 }),
    db.organization.findUniqueOrThrow({ where: { id: ctx.org.id }, select: { settings: true } }),
    db.calibrationJob.findMany({
      where: { instrumentId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        vendor: { select: { name: true } },
        poItem: { select: { po: { select: { id: true, number: true } } } },
        challanItem: { select: { challan: { select: { id: true, number: true } } } },
        ootCases: { select: { id: true, status: true } },
      },
    }),
  ]);
  const verified = jobs.filter((j) => j.verifiedAt);
  const canVerify = ctx.can("certificate.verify", instrument.plantId);
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = new Map(
    (await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })).map((u) => [
      u.id,
      u.name ?? u.email,
    ]),
  );

  const orgLead = parseOrgSettings(org.settings).dueSoonDays;
  const lead = instrument.planLeadDays ?? instrument.type.defaultLeadTimeDays ?? orgLead;
  const leadSource =
    instrument.planLeadDays != null ? "instrument" : instrument.type.defaultLeadTimeDays != null ? "type" : "org";
  const terminal = instrument.status === "SCRAPPED" || instrument.status === "LOST";
  const state = terminal ? "NOT_SCHEDULED" : dueStateFromPlanning(instrument.nextDueAt, instrument.planningDate);
  const std = effectiveStandard(instrument);
  const qrUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/i/${instrument.qrToken}`;
  const qrSvg = await QRCode.toString(qrUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const canManage = ctx.can("instrument.manage", instrument.plantId);

  const n = (d: { toNumber(): number } | null) => (d == null ? null : d.toNumber());
  const range =
    n(instrument.rangeMin) != null && n(instrument.rangeMax) != null
      ? `${n(instrument.rangeMin)} – ${n(instrument.rangeMax)} ${instrument.unit ?? ""}`
      : null;
  const tol =
    n(instrument.tolerancePlus) != null || n(instrument.toleranceMinus) != null
      ? n(instrument.tolerancePlus) === n(instrument.toleranceMinus)
        ? `± ${n(instrument.tolerancePlus)}`
        : `+${n(instrument.tolerancePlus) ?? 0} / −${n(instrument.toleranceMinus) ?? 0}`
      : null;
  const location = instrument.location
    ? instrument.location.parent
      ? `${instrument.location.parent.name} › ${instrument.location.name}`
      : instrument.location.name
    : null;

  const facts: [string, React.ReactNode][] = [
    [t("instruments.type"), instrument.type.name],
    [t("instruments.description"), instrument.description],
    [t("instruments.make"), [instrument.make, instrument.model].filter(Boolean).join(" ")],
    [t("instruments.serialNo"), instrument.serialNo],
    [t("instruments.range"), range],
    [t("instruments.leastCount"), n(instrument.leastCount)],
    [t("instruments.tolerancePlus").replace(" +", ""), tol],
    [t("instruments.acceptanceCriteria"), instrument.acceptanceCriteria],
    [
      t("instruments.adjustable"),
      instrument.adjustable == null ? null : t(`adjustability.${instrument.adjustable ? "ADJUSTABLE" : "NON_ADJUSTABLE"}`),
    ],
    [
      t("instruments.standard"),
      std.standardCode
        ? `${std.standardCode}${std.standardDate ? ` (${formatDate(std.standardDate)})` : ""}${std.inherited ? ` · ${t("instruments.fromType")}` : ""}`
        : null,
    ],
    [
      t("instruments.planningDate"),
      instrument.planningDate
        ? `${formatDate(instrument.planningDate)} · ${t(`instruments.leadFrom.${leadSource}`, { days: lead })}`
        : null,
    ],
    [t("instruments.plant"), `${instrument.plant.code} · ${instrument.plant.name}`],
    [t("instruments.department"), instrument.department?.name],
    [t("instruments.location"), location],
    [t("instruments.custodian"), instrument.custodianName],
    [t("instruments.criticality"), t(`criticality.${instrument.criticality}`)],
    [t("instruments.source"), t(`source.${instrument.calibrationSource}`)],
    [t("instruments.frequency"), `${instrument.frequencyValue} ${t(`frequencyUnit.${instrument.frequencyUnit}`)}`],
    [t("masters.nabl"), instrument.nablRequired ? t("common.yes") : t("common.no")],
    [t("instruments.purchaseValue"), instrument.purchaseValue ? formatINR(instrument.purchaseValue.toNumber()) : null],
    [t("instruments.notes"), instrument.notes],
  ];

  const describe = (e: (typeof events)[number]) => {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === "CREATED" && p.source === "import") return t("events.fromImport", { file: String(p.file ?? "Excel") });
    if (e.type === "EDITED" && Array.isArray(p.fields)) return t("events.fields", { fields: (p.fields as string[]).join(", ") });
    if (e.type === "SENT")
      return t("events.sentTo", {
        vendor: String(p.vendor ?? ""),
        challan: String(p.challan ?? ""),
        gatePass: String(p.gatePass ?? ""),
      });
    if (e.type === "RECEIVED") {
      const base = t("events.receivedFrom", { vendor: String(p.vendor ?? ""), challan: String(p.challan ?? "") });
      return p.remarks ? `${base} · ${String(p.remarks)}` : base;
    }
    if (e.type === "STATUS_CHANGED") {
      const s = t("events.statusChange", { from: t(`status.${p.from as "IN_STORE"}`), to: t(`status.${p.to as "IN_STORE"}`) });
      return p.reason ? `${s} · ${t("events.reason", { reason: String(p.reason) })}` : s;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-muted-foreground text-sm">
            <Link href="/instruments" className="hover:underline">
              {t("instruments.title")}
            </Link>{" "}
            / {instrument.type.name}
          </div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{instrument.code}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={instrument.status} />
            {instrument.archivedAt && <Badge variant="secondary">{t("instruments.archived")}</Badge>}
            <span className="text-sm">
              {t("instruments.nextDueAt")}:{" "}
              <DueText
                state={state}
                date={formatDate(instrument.nextDueAt)}
                days={instrument.nextDueAt ? daysUntilDue(instrument.nextDueAt) : null}
              />
            </span>
          </div>
        </div>
        {canManage && (
          <InstrumentActions
            id={instrument.id}
            code={instrument.code}
            archived={!!instrument.archivedAt}
            transitions={[...(MANUAL_TRANSITIONS[instrument.status] ?? [])]}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              {facts.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="text-sm break-words">{value === null || value === undefined || value === "" ? "—" : value}</dd>
                </div>
              ))}
              <div>
                <dt className="text-muted-foreground text-xs">{t("instruments.lastCalibratedAt")}</dt>
                <dd className="text-sm">
                  {formatDate(instrument.lastCalibratedAt) || "—"} ·{" "}
                  <Link
                    href={`/instruments/${instrument.id}/history`}
                    className="underline underline-offset-4"
                    data-testid="history-link"
                  >
                    {t("instruments.fullHistory")}
                  </Link>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("instruments.qr")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="w-40 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/i/${instrument.qrToken}`}>{t("instruments.openQr")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" />
              {t("instruments.history")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l pl-6" data-testid="history">
              {events.map((e) => {
                const Icon = EVENT_ICON[e.type];
                const detail = describe(e);
                return (
                  <li key={e.id} className="relative">
                    <span className="bg-background absolute top-0.5 -left-[33px] rounded-full border p-1">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="text-sm font-medium">{t(`events.${e.type}`)}</div>
                    {detail && <div className="text-muted-foreground text-sm">{detail}</div>}
                    <div className="text-muted-foreground text-xs">
                      {formatDateTime(e.at)} · {e.actorId ? (actors.get(e.actorId) ?? "—") : t("audit.system")}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("instruments.jobs")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {jobs.length === 0 ? (
                <p className="text-muted-foreground">{t("instruments.jobsEmpty")}</p>
              ) : (
                <ul className="space-y-3" data-testid="jobs">
                  {jobs.map((j) => (
                    <li key={j.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{j.vendor?.name ?? t("source.INHOUSE")}</span>
                        <span className="flex items-center gap-1.5">
                          {j.result && <StatusPill label={t(`verification.${j.result}`)} tone={RESULT_TONE[j.result]} />}
                          <Badge variant="outline">{t(`jobStatus.${j.status}`)}</Badge>
                        </span>
                      </div>
                      <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                        {j.poItem && (
                          <Link href={`/purchase/orders/${j.poItem.po.id}`} className="font-mono hover:underline">
                            {j.poItem.po.number}
                          </Link>
                        )}
                        {j.challanItem && (
                          <Link href={`/dispatch/challans/${j.challanItem.challan.id}`} className="font-mono hover:underline">
                            {j.challanItem.challan.number}
                          </Link>
                        )}
                        {j.sentAt && <span>↑ {formatDate(j.sentAt)}</span>}
                        {j.receivedAt && <span>↓ {formatDate(j.receivedAt)}</span>}
                        {j.certificateFileId && (
                          <a
                            href={`/api/attachments/${j.certificateFileId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-4 hover:underline"
                            data-testid="job-certificate"
                          >
                            {t("lab.certificate")} ↗
                          </a>
                        )}
                        {j.status === "CERT_UPLOADED" && canVerify && (
                          <Link href={`/verification/${j.id}`} className="underline-offset-4 hover:underline">
                            {t("verification.verify")}
                          </Link>
                        )}
                        {j.ootCases.map((o) => (
                          <Link
                            key={o.id}
                            href={`/verification/oot/${o.id}`}
                            className="text-red-700 underline-offset-4 hover:underline dark:text-red-400"
                          >
                            OOT · {t(`ootStatus.${o.status}`)}
                          </Link>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("instruments.certificates")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {verified.length === 0 ? (
                <p className="text-muted-foreground">{t("instruments.certsEmpty")}</p>
              ) : (
                <ul className="space-y-2" data-testid="certificates">
                  {verified.map((j) => (
                    <li key={j.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {j.certificateFileId ? (
                        <a
                          href={`/api/attachments/${j.certificateFileId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono underline-offset-4 hover:underline"
                        >
                          {j.certificateNo}
                        </a>
                      ) : (
                        <span className="font-mono">{j.certificateNo}</span>
                      )}
                      {j.result && <StatusPill label={t(`verification.${j.result}`)} tone={RESULT_TONE[j.result]} />}
                      <span className="text-muted-foreground text-xs">
                        {formatDate(j.calibratedAt)} · {j.vendor?.name ?? t("source.INHOUSE")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
