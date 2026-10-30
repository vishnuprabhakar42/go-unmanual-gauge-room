import type { z } from "zod";
import { startOfIstDay } from "@/domain/due";
import type { rateContractSchema, rateItemSchema } from "@/domain/vendor-schemas";
import type { ContractRate } from "@/domain/vendor-selection";
import { UserError } from "@/server/errors";
import { currentTenant, type TenantClient, type TenantTx } from "@/server/tenant";

type ContractData = z.output<typeof rateContractSchema>;
type ItemData = z.output<typeof rateItemSchema>;

export async function createRateContract(tx: TenantTx, d: ContractData) {
  await tx.vendor.findUniqueOrThrow({ where: { id: d.vendorId } }); // must be linked
  if (d.plantId) await tx.plant.findUniqueOrThrow({ where: { id: d.plantId } });
  const dup = await tx.rateContract.findFirst({ where: { number: d.number } });
  if (dup) throw new UserError(`Contract ${d.number} already exists`, { number: ["Already used"] });
  return tx.rateContract.create({
    data: {
      organizationId: currentTenant().organizationId,
      vendorId: d.vendorId,
      plantId: d.plantId ?? null,
      number: d.number,
      validFrom: d.validFrom!,
      validTo: d.validTo!,
      notes: d.notes ?? null,
    },
  });
}

export async function updateRateContract(tx: TenantTx, id: string, d: ContractData) {
  const c = await tx.rateContract.findUniqueOrThrow({ where: { id } });
  if (c.status === "EXPIRED") throw new UserError("Expired contracts can't be changed — create a new one");
  return tx.rateContract.update({
    where: { id },
    data: { plantId: d.plantId ?? null, number: d.number, validFrom: d.validFrom!, validTo: d.validTo!, notes: d.notes ?? null },
  });
}

/** Replaces the contract's item list (rows not present are archived). */
export async function saveRateItems(tx: TenantTx, contractId: string, items: ItemData[]) {
  const { organizationId } = currentTenant();
  const c = await tx.rateContract.findUniqueOrThrow({ where: { id: contractId } });
  if (c.status === "EXPIRED") throw new UserError("Expired contracts can't be changed");
  const typeIds = items.map((i) => i.instrumentTypeId);
  if (new Set(typeIds).size !== typeIds.length) throw new UserError("Each instrument type can appear only once");
  const existing = await tx.rateContractItem.findMany({ where: { contractId } });
  const byType = new Map(existing.map((e) => [e.instrumentTypeId, e]));
  for (const item of items) {
    const prev = byType.get(item.instrumentTypeId);
    const data = {
      rate: item.rate,
      gstPercent: item.gstPercent,
      onsiteRate: item.onsiteRate ?? null,
      tatDays: item.tatDays,
      archivedAt: null,
    };
    if (prev) await tx.rateContractItem.update({ where: { id: prev.id }, data });
    else
      await tx.rateContractItem.create({
        data: { organizationId, contractId, instrumentTypeId: item.instrumentTypeId, ...data },
      });
  }
  const keep = new Set(typeIds);
  const removed = existing.filter((e) => !keep.has(e.instrumentTypeId) && !e.archivedAt).map((e) => e.id);
  if (removed.length) await tx.rateContractItem.updateMany({ where: { id: { in: removed } }, data: { archivedAt: new Date() } });
}

export async function activateRateContract(tx: TenantTx, id: string, now = new Date()) {
  const c = await tx.rateContract.findUniqueOrThrow({ where: { id }, include: { items: { where: { archivedAt: null } } } });
  if (c.status !== "DRAFT") throw new UserError(`Contract is ${c.status.toLowerCase()}`);
  if (!c.items.length) throw new UserError("Add at least one rate before activating");
  if (c.validTo < startOfIstDay(now)) throw new UserError("The contract has already ended");
  await tx.rateContract.update({ where: { id }, data: { status: "ACTIVE" } });
}

export async function expireRateContract(tx: TenantTx, id: string) {
  const c = await tx.rateContract.findUniqueOrThrow({ where: { id } });
  if (c.status === "EXPIRED") return;
  await tx.rateContract.update({ where: { id }, data: { status: "EXPIRED" } });
}

/** Nightly: ACTIVE contracts past their end date become EXPIRED (audited per row). */
export async function expireEndedContracts(tx: TenantTx, now = new Date()) {
  const res = await tx.rateContract.updateMany({
    where: { status: "ACTIVE", validTo: { lt: startOfIstDay(now) } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}

/** All contract rates for these instrument types, shaped for vendor selection. */
export async function contractRatesByType(
  db: Pick<TenantClient, "rateContractItem">,
  organizationId: string,
  typeIds: string[],
): Promise<Map<string, ContractRate[]>> {
  const rows = await db.rateContractItem.findMany({
    where: { instrumentTypeId: { in: typeIds }, archivedAt: null, contract: { archivedAt: null, status: { not: "DRAFT" } } },
    include: {
      contract: {
        select: {
          status: true,
          plantId: true,
          validFrom: true,
          validTo: true,
          vendor: {
            select: {
              id: true,
              name: true,
              accreditationType: true,
              nablValidUntil: true,
              links: { where: { organizationId }, select: { isApproved: true, archivedAt: true } },
            },
          },
        },
      },
    },
  });
  const map = new Map<string, ContractRate[]>();
  for (const r of rows) {
    const v = r.contract.vendor;
    const link = v.links[0];
    const rate: ContractRate = {
      vendorId: v.id,
      vendorName: v.name,
      rateContractItemId: r.id,
      rate: r.rate.toNumber(),
      tatDays: r.tatDays,
      contractStatus: r.contract.status,
      contractPlantId: r.contract.plantId,
      validFrom: r.contract.validFrom,
      validTo: r.contract.validTo,
      vendorApproved: !!link?.isApproved && !link.archivedAt,
      accreditationType: v.accreditationType,
      nablValidUntil: v.nablValidUntil,
    };
    map.set(r.instrumentTypeId, [...(map.get(r.instrumentTypeId) ?? []), rate]);
  }
  return map;
}
