import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/server/db";
import { createPlantWithSeries } from "@/server/services/setup";
import { withTenantTx, type TenantContext } from "@/server/tenant";

export async function makeOrg(name: string, plantCodes: string[] = ["P1"]) {
  const actor = await prisma.user.create({ data: { email: `${createId()}@test.local`, name: `${name} admin` } });
  const organizationId = createId();
  const ctx: TenantContext = { organizationId, actorId: actor.id, plantIds: "ALL", ip: "127.0.0.1" };
  const plants = await withTenantTx(ctx, async (tx) => {
    await tx.organization.create({ data: { id: organizationId, name } });
    await tx.membership.create({ data: { organizationId, userId: actor.id, role: "ORG_ADMIN", plantId: null } });
    const out = [];
    for (const code of plantCodes)
      out.push(await createPlantWithSeries(tx, { name: `${name} ${code}`, code, address: null, gstin: null }));
    return out;
  });
  return { ctx, organizationId, actor, plants };
}
