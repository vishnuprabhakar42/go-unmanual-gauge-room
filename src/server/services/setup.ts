import { createId } from "@paralleldrive/cuid2";
import type { z } from "zod";
import type { DocType } from "@/generated/prisma/client";
import { gstinStateCode } from "@/domain/india/gstin";
import { DEFAULT_SERIES, financialYear } from "@/domain/numbering";
import type { plantSchema, setupSchema } from "@/domain/schemas";
import { orgSettingsSchema } from "@/domain/settings";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { currentTenant, withTenantTx, type TenantTx } from "@/server/tenant";

/** First-run setup: organization + first plant + creator as ORG_ADMIN, in one audited transaction. */
export async function createOrganizationForUser(
  userId: string,
  input: z.output<typeof setupSchema>,
  ip: string | null,
): Promise<{ organizationId: string; plantId: string }> {
  const existing = await prisma.membership.findFirst({ where: { userId, archivedAt: null } });
  if (existing) throw new UserError("You already belong to an organization.");

  const organizationId = createId();
  return withTenantTx({ organizationId, actorId: userId, plantIds: "ALL", ip }, async (tx) => {
    await tx.organization.create({
      data: { id: organizationId, ...input.organization, settings: orgSettingsSchema.parse({}) },
    });
    const plant = await createPlantWithSeries(tx, input.plant);
    await tx.membership.create({ data: { organizationId, userId, role: "ORG_ADMIN", plantId: null } });
    return { organizationId, plantId: plant.id };
  });
}

/** Creates a plant plus its current-FY number series. */
export async function createPlantWithSeries(tx: TenantTx, data: z.output<typeof plantSchema>) {
  const organizationId = currentTenant().organizationId;
  const plant = await tx.plant.create({
    data: { organizationId, ...data, stateCode: data.gstin ? gstinStateCode(data.gstin) : null },
  });
  const fy = financialYear(new Date()).label;
  await tx.numberSeries.createMany({
    data: (Object.keys(DEFAULT_SERIES) as DocType[]).map((docType) => ({
      organizationId,
      plantId: plant.id,
      docType,
      fy,
      ...DEFAULT_SERIES[docType],
    })),
  });
  return plant;
}
