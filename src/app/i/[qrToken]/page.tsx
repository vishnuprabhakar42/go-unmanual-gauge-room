import { Gauge } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DueText, StatusBadge } from "@/components/instruments/badges";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { daysUntilDue, dueStateFromPlanning } from "@/domain/due";
import { formatDate } from "@/domain/india/format";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { MarkReceivedButton } from "./mark-received";

export const metadata: Metadata = { title: "Instrument status" };

/** Target of the QR label. Requires sign-in (proxy redirects); scoped to the user's org and plants. */
export default async function QrStatusPage({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const ctx = await requirePermission("instrument.view");
  const t = await getTranslations();
  const db = tenantDb(ctx.tenant);
  const inst = await db.instrument.findFirst({
    where: { qrToken },
    include: { type: true, plant: true, department: true, location: true },
  });
  const terminal = inst?.status === "SCRAPPED" || inst?.status === "LOST";
  const state = inst && !terminal ? dueStateFromPlanning(inst.nextDueAt, inst.planningDate) : "NOT_SCHEDULED";

  return (
    <main className="bg-muted/40 flex min-h-dvh flex-col items-center gap-4 p-4">
      <div className="flex items-center gap-2 pt-4">
        <Logo className="size-7" />
        <span className="font-semibold">{t("app.name")}</span>
      </div>
      {!inst ? (
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center text-sm">{t("qr.notFound")}</CardContent>
        </Card>
      ) : (
        <QrCard
          code={inst.code}
          type={inst.type.name}
          description={inst.description}
          status={inst.status}
          last={formatDate(inst.lastCalibratedAt)}
          next={formatDate(inst.nextDueAt)}
          dueStateValue={state}
          days={inst.nextDueAt ? daysUntilDue(inst.nextDueAt) : null}
          where={[inst.plant.code, inst.department?.name, inst.location?.name].filter(Boolean).join(" · ")}
          custodian={inst.custodianName}
          href={`/instruments/${inst.id}`}
          receiveToken={inst.status === "AT_VENDOR" && ctx.can("receipt.manage", inst.plantId) ? inst.qrToken : null}
          labels={{
            title: t("qr.title"),
            last: t("instruments.lastCalibratedAt"),
            next: t("instruments.nextDueAt"),
            where: t("instruments.location"),
            custodian: t("instruments.custodian"),
            open: t("qr.openRecord"),
          }}
        />
      )}
    </main>
  );
}

function QrCard(props: {
  code: string;
  type: string;
  description: string | null;
  status: Parameters<typeof StatusBadge>[0]["status"];
  last: string;
  next: string;
  dueStateValue: ReturnType<typeof dueStateFromPlanning>;
  days: number | null;
  where: string;
  custodian: string | null;
  href: string;
  receiveToken: string | null;
  labels: Record<"title" | "last" | "next" | "where" | "custodian" | "open", string>;
}) {
  return (
    <Card className="w-full max-w-md" data-testid="qr-card">
      <CardHeader>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Gauge className="size-4" />
          {props.labels.title}
        </div>
        <CardTitle className="font-mono text-2xl">{props.code}</CardTitle>
        <div className="text-sm">{props.description || props.type}</div>
        <div className="pt-1">
          <StatusBadge status={props.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-muted-foreground text-xs">{props.labels.last}</div>
            <div className="font-medium">{props.last || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">{props.labels.next}</div>
            <DueText state={props.dueStateValue} date={props.next} days={props.days} />
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground text-xs">{props.labels.where}</div>
            <div>{props.where}</div>
          </div>
          {props.custodian && (
            <div className="col-span-2">
              <div className="text-muted-foreground text-xs">{props.labels.custodian}</div>
              <div>{props.custodian}</div>
            </div>
          )}
        </div>
        {props.receiveToken && <MarkReceivedButton token={props.receiveToken} />}
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href={props.href}>{props.labels.open}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
