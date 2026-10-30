import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { GLOBAL_MODELS, ORG_SCOPED_MODELS } from "@/server/tenant/models";
import { TenantViolationError, tenantDb, withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

describe("multi-tenancy", () => {
  it("every Prisma model is classified as org-scoped or global", () => {
    for (const model of Object.values(Prisma.ModelName)) {
      expect(ORG_SCOPED_MODELS.has(model) || GLOBAL_MODELS.has(model), `${model} must be classified`).toBe(true);
    }
  });

  it("one org cannot read or modify another org's data", async () => {
    const a = await makeOrg("Org A", ["A1"]);
    const b = await makeOrg("Org B", ["B1"]);
    await withTenantTx(b.ctx, (tx) =>
      tx.department.create({ data: { organizationId: b.organizationId, plantId: b.plants[0].id, name: "Secret dept" } }),
    );

    const dbA = tenantDb(a.ctx);
    const plantsA = await dbA.plant.findMany();
    expect(plantsA.map((p) => p.code)).toEqual(["A1"]);
    expect(await dbA.plant.findUnique({ where: { id: b.plants[0].id } })).toBeNull();
    expect(await dbA.department.count()).toBe(0);
    expect(await dbA.department.findFirst({ where: { name: "Secret dept" } })).toBeNull();
    expect(await dbA.organization.findMany()).toHaveLength(1);
    expect((await dbA.user.findMany()).map((u) => u.id)).toEqual([a.actor.id]);
    expect(await dbA.auditLog.count({ where: { organizationId: b.organizationId } })).toBe(0);

    // Explicit OR attempts are still AND-ed with the org scope
    const sneaky = await dbA.plant.findMany({ where: { OR: [{ organizationId: b.organizationId }, { code: "B1" }] } });
    expect(sneaky).toHaveLength(0);

    await expect(
      withTenantTx(a.ctx, (tx) => tx.plant.update({ where: { id: b.plants[0].id }, data: { name: "hacked" } })),
    ).rejects.toThrow();
    await expect(withTenantTx(a.ctx, (tx) => tx.plant.updateMany({ data: { name: "hacked" } }))).resolves.toBeDefined();
    const bPlant = await prisma.plant.findUniqueOrThrow({ where: { id: b.plants[0].id } });
    expect(bPlant.name).toBe("Org B B1");

    await expect(
      withTenantTx(a.ctx, (tx) =>
        tx.department.create({ data: { organizationId: b.organizationId, plantId: b.plants[0].id, name: "x" } }),
      ),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("plant-limited users only see their plants", async () => {
    const org = await makeOrg("Org C", ["C1", "C2"]);
    const [c1, c2] = org.plants;
    await withTenantTx(org.ctx, async (tx) => {
      await tx.department.create({ data: { organizationId: org.organizationId, plantId: c1.id, name: "D1" } });
      await tx.department.create({ data: { organizationId: org.organizationId, plantId: c2.id, name: "D2" } });
    });
    const limited = { ...org.ctx, plantIds: [c1.id] };
    const db = tenantDb(limited);
    expect((await db.department.findMany()).map((d) => d.name)).toEqual(["D1"]);
    expect((await db.plant.findMany()).map((p) => p.code)).toEqual(["C1"]);
    await expect(
      withTenantTx(limited, (tx) =>
        tx.department.create({ data: { organizationId: org.organizationId, plantId: c2.id, name: "D3" } }),
      ),
    ).rejects.toBeInstanceOf(TenantViolationError);
    await expect(
      withTenantTx(limited, (tx) => tx.plant.create({ data: { organizationId: org.organizationId, name: "New", code: "C3" } })),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("refuses hard deletes and mutations outside a tenant transaction", async () => {
    const org = await makeOrg("Org D", ["D1"]);
    await expect(withTenantTx(org.ctx, (tx) => tx.plant.delete({ where: { id: org.plants[0].id } }))).rejects.toThrow(
      /Hard deletes are not allowed/,
    );
    await expect(tenantDb(org.ctx).plant.update({ where: { id: org.plants[0].id }, data: { name: "x" } })).rejects.toThrow(
      /inside withTenantTx/,
    );
  });
});
