import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { NodeDialog, NodesTable, type NodeRow } from "./nodes-client";

type Kind = "department" | "location";
type Raw = {
  id: string;
  name: string;
  parentId: string | null;
  plantId: string;
  archivedAt: Date | null;
  plant: { code: string };
};

/** Depth-first order so children follow their parent (hierarchy shown by indentation). */
function toTree(rows: Raw[]): NodeRow[] {
  const byParent = new Map<string | null, Raw[]>();
  for (const r of rows) {
    const key = r.parentId && rows.some((x) => x.id === r.parentId) ? r.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }
  const out: NodeRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const r of (byParent.get(parent) ?? []).sort(
      (a, b) => a.plant.code.localeCompare(b.plant.code) || a.name.localeCompare(b.name),
    )) {
      out.push({
        id: r.id,
        name: r.name,
        parentId: r.parentId,
        plantId: r.plantId,
        plantCode: r.plant.code,
        depth,
        archived: !!r.archivedAt,
      });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export async function NodesPage({ kind }: { kind: Kind }) {
  const ctx = await requirePermission("masters.manage");
  const t = await getTranslations("masters");
  const db = tenantDb(ctx.tenant);
  const where = ctx.currentPlantId ? { plantId: ctx.currentPlantId } : {};
  const select = {
    id: true,
    name: true,
    parentId: true,
    plantId: true,
    archivedAt: true,
    plant: { select: { code: true } },
  } as const;
  const rows =
    kind === "department" ? await db.department.findMany({ where, select }) : await db.location.findMany({ where, select });
  const tree = toTree(rows);
  const plants = ctx.plants
    .filter((p) => !ctx.currentPlantId || p.id === ctx.currentPlantId)
    .map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));
  return (
    <>
      <PageHeader
        title={kind === "department" ? t("departments") : t("locations")}
        subtitle={kind === "department" ? t("deptSubtitle") : t("locSubtitle")}
        actions={<NodeDialog kind={kind} plants={plants} nodes={tree} />}
      />
      <NodesTable kind={kind} rows={tree} plants={plants} />
    </>
  );
}
