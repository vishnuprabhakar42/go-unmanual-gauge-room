import type { z } from "zod";
import { gstinStateCode } from "@/domain/india/gstin";
import { DEFAULT_SERIES, financialYear, validateSeriesTemplate } from "@/domain/numbering";
import type { plantSchema } from "@/domain/schemas";
import { UserError } from "@/server/errors";
import type { TenantTx } from "@/server/tenant";
import { createPlantWithSeries } from "./setup";

type PlantData = z.output<typeof plantSchema>;

function assertCodeFitsSeries(code: string) {
  const res = validateSeriesTemplate("DC", DEFAULT_SERIES.DC, code, financialYear(new Date()));
  if (!res.ok) throw new UserError(res.error, { code: [res.error] });
}

export async function createPlant(tx: TenantTx, data: PlantData) {
  assertCodeFitsSeries(data.code);
  const dup = await tx.plant.findFirst({ where: { code: data.code } });
  if (dup) throw new UserError(`Plant code ${data.code} is already used`, { code: ["Already used"] });
  return createPlantWithSeries(tx, data);
}

export async function updatePlant(tx: TenantTx, id: string, data: PlantData) {
  const current = await tx.plant.findUniqueOrThrow({ where: { id } });
  if (current.code !== data.code) {
    assertCodeFitsSeries(data.code);
    const dup = await tx.plant.findFirst({ where: { code: data.code, id: { not: id } } });
    if (dup) throw new UserError(`Plant code ${data.code} is already used`, { code: ["Already used"] });
  }
  return tx.plant.update({
    where: { id },
    data: { ...data, stateCode: data.gstin ? gstinStateCode(data.gstin) : current.stateCode },
  });
}

export async function setPlantArchived(tx: TenantTx, id: string, archived: boolean) {
  if (archived) {
    const active = await tx.plant.count({ where: { archivedAt: null } });
    if (active <= 1) throw new UserError("You need at least one active plant.");
  }
  return tx.plant.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}
