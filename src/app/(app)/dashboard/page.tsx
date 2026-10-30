import {
  AlertTriangle,
  ListTodo,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  ShieldAlert,
  Truck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { StatTile } from "@/components/charts/stat-tile";
import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/data/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGING_BUCKETS, monthRange } from "@/domain/due";
import { requirePermission } from "@/server/context";
import { dashboardStats, loadDueConfig } from "@/server/services/due-planning";
import { nablExpiringCount } from "@/server/services/vendors";
import { tenantDb } from "@/server/tenant";

export const metadata: Metadata = { title: "Dashboard" };

const monthLabel = (key: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(monthRange(key).gte);

export default async function DashboardPage() {
  const ctx = await requirePermission("dashboard.view");
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const db = tenantDb(ctx.tenant);
  const due = await loadDueConfig(db);
  const [stats, plantCount, memberCount, nablExpiring] = await Promise.all([
    dashboardStats(db, due, ctx.currentPlantId),
    db.plant.count({ where: { archivedAt: null } }),
    db.membership.count({ where: { archivedAt: null } }),
    nablExpiringCount(db, ctx.org.id),
  ]);
  const vendorCount = await db.vendor.count({ where: { archivedAt: null } });
  const plantLabel = ctx.plants.find((p) => p.id === ctx.currentPlantId)?.name ?? tc("allPlants");
  const canPlan = ctx.can("calibration.request");
  const drill = (q: string) => (canPlan ? `/due?${q}` : `/instruments?${q}`);

  const checklist = [
    { label: t("checkPlants"), done: plantCount > 0, href: "/settings/plants", allowed: ctx.can("plant.manage") },
    { label: t("checkUsers"), done: memberCount > 1, href: "/settings/users", allowed: ctx.can("user.manage") },
    { label: t("checkInstruments"), done: stats.active > 0, href: "/instruments/import", allowed: ctx.can("instrument.manage") },
    { label: t("checkVendors"), done: vendorCount > 0, href: "/vendors/new", allowed: ctx.can("vendor.manage") },
  ];

  const header = (
    <PageHeader
      title={t("welcome", { name: ctx.user.name ?? ctx.user.email })}
      subtitle={t("subtitle", { org: ctx.org.name, plant: plantLabel })}
    />
  );

  if (stats.active === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={Gauge}
          title={t("emptyTitle")}
          body={t("emptyBody")}
          action={
            ctx.can("instrument.manage") && (
              <Button asChild className="h-11">
                <Link href="/instruments/import">{t("emptyCta")}</Link>
              </Button>
            )
          }
        />
        <Checklist items={checklist} title={t("setupChecklist")} />
      </>
    );
  }

  const columns = [
    {
      key: "overdue",
      label: t("overdueBar"),
      value: stats.overdue,
      href: drill("due=OVERDUE"),
      tone: "critical" as const,
      tooltip: `${t("overdueBar")}: ${t("instrumentsCount", { count: stats.overdue })}`,
    },
    ...stats.dueByMonth.map((m) => ({
      key: m.month,
      label: monthLabel(m.month),
      value: m.count,
      href: drill(`month=${m.month}`),
      tooltip: `${monthLabel(m.month)}: ${t("instrumentsCount", { count: m.count })}`,
    })),
  ];

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
        <StatTile
          label={t("overdueTile")}
          value={stats.overdue}
          href={drill("due=OVERDUE")}
          icon={AlertTriangle}
          tone={stats.overdue ? "critical" : undefined}
          testId="kpi-overdue"
        />
        <StatTile
          label={t("dueSoonTile2")}
          hint={t("dueSoonHint")}
          value={stats.dueSoon}
          href={drill("due=DUE_SOON")}
          icon={CalendarClock}
          tone={stats.dueSoon ? "warning" : undefined}
          testId="kpi-due-soon"
        />
        <StatTile
          label={t("planningTile")}
          value={stats.planningReached}
          href="/due"
          icon={ListTodo}
          tone={stats.planningReached ? "warning" : undefined}
          hint={t("planningHint")}
          testId="kpi-planning"
        />
        <StatTile label={t("atVendorTile")} value={stats.atVendor} href="/instruments?status=AT_VENDOR" icon={Truck} />
        <StatTile label={t("awaitingTile")} value={stats.awaitingVerification} href="/verification" icon={ClipboardCheck} />
        <StatTile
          label={t("ootTile")}
          value={stats.openOot}
          href="/verification/oot"
          icon={ShieldAlert}
          tone={stats.openOot ? "critical" : undefined}
        />
        <StatTile
          label={t("openRequestsTile")}
          value={stats.openRequests}
          href={canPlan ? "/requests" : undefined}
          icon={ClipboardList}
        />
        <StatTile
          label={t("nablTile")}
          value={nablExpiring}
          href={ctx.can("vendor.view") ? "/vendors?acc=NABL" : undefined}
          icon={BadgeCheck}
          tone={nablExpiring ? "warning" : undefined}
          hint={nablExpiring ? t("nablHint") : t("nablNone")}
        />
        <StatTile label={t("instruments")} value={stats.active} href="/instruments" icon={Gauge} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("dueByMonth")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ColumnChart
              columns={columns}
              ariaLabel={t("dueByMonth")}
              tableLabels={{ table: t("chartTable"), label: t("month"), value: t("count") }}
            />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("agingTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList
                ariaLabel={t("agingTitle")}
                items={AGING_BUCKETS.map((b) => ({ key: b, label: t("agingDays", { bucket: b }), value: stats.aging[b] }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("byDepartment")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList
                ariaLabel={t("byDepartment")}
                empty={t("noneOverdue")}
                items={stats.overdueByDepartment.map((d) => ({
                  key: d.departmentId ?? "none",
                  label: d.name,
                  value: d.count,
                  href: d.departmentId ? drill(`due=OVERDUE&dept=${d.departmentId}`) : undefined,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      {checklist.some((c) => !c.done) && <Checklist items={checklist} title={t("setupChecklist")} />}
    </>
  );
}

function Checklist({
  items,
  title,
}: {
  items: { label: string; done: boolean; href: string | null; allowed: boolean }[];
  title: string;
}) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="setup-checklist">
          {items.map((item) => {
            const Icon = item.done ? CheckCircle2 : Circle;
            const label = <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>;
            return (
              <li key={item.label} className="flex items-center gap-3 text-sm">
                <Icon className={item.done ? "size-5 text-emerald-600" : "text-muted-foreground size-5"} />
                {item.href && item.allowed && !item.done ? (
                  <Link href={item.href} className="underline-offset-4 hover:underline">
                    {label}
                  </Link>
                ) : (
                  label
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
