import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/domain/india/format";
import { GST_STATES } from "@/domain/india/states";
import { effectiveContractStatus } from "@/domain/purchase-status";
import type { Contact } from "@/domain/vendor-schemas";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { NablBadge } from "../nabl-badge";
import { PortalUsers } from "./portal-users";
import { ScopeManager } from "./scope-manager";

export const metadata: Metadata = { title: "Vendor" };

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("vendor.view");
  const t = await getTranslations();
  const db = tenantDb(ctx.tenant);
  const v = await db.vendor.findUnique({
    where: { id },
    include: {
      links: { where: { organizationId: ctx.org.id } },
      scopes: { where: { archivedAt: null }, orderBy: [{ discipline: "asc" }, { parameter: "asc" }] },
      users: { where: { archivedAt: null }, include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!v) notFound();
  const contracts = await db.rateContract.findMany({
    where: { vendorId: id },
    orderBy: { validTo: "desc" },
    include: { _count: { select: { items: { where: { archivedAt: null } } } } },
  });
  const link = v.links[0];
  const contacts = (v.contacts ?? []) as Contact[];
  const canManage = ctx.can("vendor.manage");
  const owner = v.ownerOrganizationId === ctx.org.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-muted-foreground text-sm">
            <Link href="/vendors" className="hover:underline">
              {t("vendors.title")}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold">{v.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <NablBadge type={v.accreditationType} validUntil={v.nablValidUntil} />
            {link?.isApproved ? (
              <Badge variant="secondary">{t("vendors.approvedBadge")}</Badge>
            ) : (
              <Badge variant="outline">{t("vendors.notApproved")}</Badge>
            )}
            {v.onsiteCapable && <Badge variant="outline">{t("vendors.onsite")}</Badge>}
          </div>
        </div>
        {canManage && (
          <Button asChild variant="outline" className="h-10">
            <Link href={`/vendors/${v.id}/edit`}>
              <Pencil className="size-4" />
              {t("common.edit")}
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {(
                [
                  [t("vendors.gstin"), v.gstin],
                  [t("vendors.pan"), v.pan],
                  [t("vendors.state"), v.stateCode ? `${v.stateCode} · ${GST_STATES[v.stateCode] ?? ""}` : null],
                  [t("vendors.nablCertNo"), v.nablCertNo],
                  [t("vendors.nablValidUntil"), formatDate(v.nablValidUntil)],
                  [t("vendors.address"), v.address],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="break-words">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {link?.evaluationNotes && (
              <div className="mt-4 text-sm">
                <div className="text-muted-foreground text-xs">{t("vendors.evaluationNotes")}</div>
                <p className="whitespace-pre-wrap">{link.evaluationNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("vendors.contacts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {contacts.length === 0 && <p className="text-muted-foreground">—</p>}
            {contacts.map((c, i) => (
              <div key={i}>
                <div className="font-medium">
                  {c.name} {c.isPrimary && <Badge variant="outline">{t("vendors.primary")}</Badge>}
                </div>
                {c.email && <div className="text-muted-foreground">{c.email}</div>}
                {c.phone && <div className="text-muted-foreground">{c.phone}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <PortalUsers
        vendorId={v.id}
        editable={canManage && owner}
        users={v.users.map((u) => ({ id: u.id, name: u.user.name, email: u.user.email }))}
      />

      <ScopeManager
        vendorId={v.id}
        editable={canManage && owner}
        rows={v.scopes.map((s) => ({
          id: s.id,
          discipline: s.discipline,
          parameter: s.parameter,
          rangeMin: s.rangeMin?.toNumber() ?? null,
          rangeMax: s.rangeMax?.toNumber() ?? null,
          unit: s.unit,
          cmc: s.cmc,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("vendors.contracts")}</CardTitle>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("vendors.noContracts")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("contracts.number")}</TableHead>
                  <TableHead>{t("contracts.validity")}</TableHead>
                  <TableHead>{t("contracts.status")}</TableHead>
                  <TableHead className="text-right">{t("contracts.items")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      {ctx.can("rateContract.manage") ? (
                        <Link href={`/purchase/contracts/${c.id}`} className="font-mono underline-offset-4 hover:underline">
                          {c.number}
                        </Link>
                      ) : (
                        <span className="font-mono">{c.number}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDate(c.validFrom)} – {formatDate(c.validTo)}
                    </TableCell>
                    <TableCell>{t(`contractStatus.${effectiveContractStatus(c)}`)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c._count.items}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
