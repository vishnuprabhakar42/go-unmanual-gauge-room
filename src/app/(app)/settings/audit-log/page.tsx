import { History } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/data/page-header";
import { Pagination, parsePage } from "@/components/data/pagination";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/domain/india/format";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { EntityFilter } from "./entity-filter";
import { summarizeChange } from "./summarize";

export const metadata: Metadata = { title: "Audit log" };
const PAGE_SIZE = 50;

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ entity?: string; page?: string }> }) {
  const ctx = await requirePermission("audit.view");
  const t = await getTranslations("audit");
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const db = tenantDb(ctx.tenant);
  const where = sp.entity ? { entity: sp.entity } : {};

  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entity"], orderBy: { entity: "asc" } }),
  ]);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
  const actors = new Map(
    (await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })).map((u) => [
      u.id,
      u.name ?? u.email,
    ]),
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<EntityFilter entities={entities.map((e) => e.entity)} allLabel={t("allEntities")} />}
      />
      {total === 0 ? (
        <EmptyState icon={History} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="audit-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("when")}</TableHead>
                  <TableHead>{t("who")}</TableHead>
                  <TableHead>{t("entity")}</TableHead>
                  <TableHead>{t("action")}</TableHead>
                  <TableHead>{t("changes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.at)}</TableCell>
                    <TableCell>{r.actorId ? (actors.get(r.actorId) ?? "—") : t("system")}</TableCell>
                    <TableCell>
                      <span className="font-medium">{r.entity}</span>
                      <span className="text-muted-foreground ml-1 font-mono text-xs">{r.entityId.slice(-6)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-md text-xs">{summarizeChange(r.before, r.after)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} basePath="/settings/audit-log" />
        </>
      )}
    </>
  );
}
