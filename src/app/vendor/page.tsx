import { ClipboardList, FileCheck2, FileQuestion, Gauge } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatTile } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/data/page-header";
import { requireVendorContext } from "@/server/vendor-portal/context";
import { portalSummary } from "@/server/vendor-portal/data";

export default async function PortalHome() {
  const ctx = await requireVendorContext();
  const t = await getTranslations("portal");
  const s = await portalSummary(ctx);
  const orgs = [...new Set(ctx.links.map((l) => l.orgName))];
  return (
    <>
      <PageHeader
        title={t("welcome", { name: ctx.user.name ?? ctx.user.email })}
        subtitle={t("subtitle", { labs: ctx.vendors.map((v) => v.name).join(", "), orgs: orgs.join(", ") || "—" })}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="portal-tiles">
        <StatTile
          label={t("rfqsTile")}
          value={s.rfqs}
          href="/vendor/rfqs"
          icon={FileQuestion}
          tone={s.rfqs ? "warning" : undefined}
        />
        <StatTile
          label={t("ordersTile")}
          value={s.posToAck}
          href="/vendor/orders"
          icon={ClipboardList}
          tone={s.posToAck ? "warning" : undefined}
        />
        <StatTile label={t("jobsTile")} value={s.atLab} href="/vendor/jobs" icon={Gauge} />
        <StatTile
          label={t("certsTile")}
          value={s.needCert}
          href="/vendor/certificates"
          icon={FileCheck2}
          tone={s.needCert ? "warning" : undefined}
        />
      </div>
    </>
  );
}
