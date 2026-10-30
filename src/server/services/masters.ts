import type { z } from "zod";
import type { instrumentTypeSchema, masterNodeSchema } from "@/domain/instrument-schemas";
import { UserError } from "@/server/errors";
import { currentTenant, type TenantTx } from "@/server/tenant";

type TypeData = z.output<typeof instrumentTypeSchema>;
type NodeData = z.output<typeof masterNodeSchema>;

export async function createInstrumentType(tx: TenantTx, data: TypeData) {
  const dup = await tx.instrumentType.findFirst({ where: { name: { equals: data.name, mode: "insensitive" } } });
  if (dup) throw new UserError(`Type “${data.name}” already exists`, { name: ["Already exists"] });
  return tx.instrumentType.create({ data: { organizationId: currentTenant().organizationId, ...data } });
}

export async function updateInstrumentType(tx: TenantTx, id: string, data: TypeData) {
  const dup = await tx.instrumentType.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, id: { not: id } } });
  if (dup) throw new UserError(`Type “${data.name}” already exists`, { name: ["Already exists"] });
  return tx.instrumentType.update({ where: { id }, data });
}

export async function setInstrumentTypeArchived(tx: TenantTx, id: string, archived: boolean) {
  if (archived) {
    const inUse = await tx.instrument.count({ where: { typeId: id, archivedAt: null } });
    if (inUse > 0) throw new UserError(`${inUse} active instruments use this type. Move them to another type first.`);
  }
  return tx.instrumentType.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

type NodeKind = "department" | "location";

async function assertParent(tx: TenantTx, kind: NodeKind, data: NodeData, selfId?: string) {
  if (!data.parentId) return;
  if (data.parentId === selfId) throw new UserError("An item can't be its own parent", { parentId: ["Invalid parent"] });
  const parent =
    kind === "department"
      ? await tx.department.findUnique({ where: { id: data.parentId } })
      : await tx.location.findUnique({ where: { id: data.parentId } });
  if (!parent || parent.plantId !== data.plantId)
    throw new UserError("Parent must be in the same plant", { parentId: ["Invalid parent"] });
  // prevent cycles: walk up from parent
  let cursor: string | null = parent.parentId;
  for (let i = 0; cursor && i < 20; i++) {
    if (cursor === selfId) throw new UserError("That would create a loop", { parentId: ["Invalid parent"] });
    const next =
      kind === "department"
        ? await tx.department.findUnique({ where: { id: cursor }, select: { parentId: true } })
        : await tx.location.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = next?.parentId ?? null;
  }
}

export async function createMasterNode(tx: TenantTx, kind: NodeKind, data: NodeData) {
  await tx.plant.findUniqueOrThrow({ where: { id: data.plantId } });
  await assertParent(tx, kind, data);
  const row = {
    organizationId: currentTenant().organizationId,
    plantId: data.plantId,
    name: data.name,
    parentId: data.parentId ?? null,
  };
  return kind === "department" ? tx.department.create({ data: row }) : tx.location.create({ data: row });
}

export async function updateMasterNode(tx: TenantTx, kind: NodeKind, id: string, data: NodeData) {
  await assertParent(tx, kind, data, id);
  const row = { name: data.name, parentId: data.parentId ?? null };
  return kind === "department"
    ? tx.department.update({ where: { id }, data: row })
    : tx.location.update({ where: { id }, data: row });
}

export async function setMasterNodeArchived(tx: TenantTx, kind: NodeKind, id: string, archived: boolean) {
  const data = { archivedAt: archived ? new Date() : null };
  return kind === "department" ? tx.department.update({ where: { id }, data }) : tx.location.update({ where: { id }, data });
}
