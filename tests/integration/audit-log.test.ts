import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { tenantDb, withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

describe("audit trail", () => {
  it("writes CREATE / UPDATE / ARCHIVE / RESTORE rows with before/after, actor and IP", async () => {
    const org = await makeOrg("Audit Org", ["AU1"]);
    const plant = org.plants[0];

    const created = await prisma.auditLog.findFirst({ where: { entity: "Plant", entityId: plant.id, action: "CREATE" } });
    expect(created?.actorId).toBe(org.actor.id);
    expect(created?.ip).toBe("127.0.0.1");
    expect(created?.organizationId).toBe(org.organizationId);
    expect((created?.after as { code: string }).code).toBe("AU1");

    await withTenantTx(org.ctx, (tx) => tx.plant.update({ where: { id: plant.id }, data: { name: "Renamed" } }));
    await withTenantTx(org.ctx, (tx) => tx.plant.update({ where: { id: plant.id }, data: { archivedAt: new Date() } }));
    await withTenantTx(org.ctx, (tx) => tx.plant.update({ where: { id: plant.id }, data: { archivedAt: null } }));

    const rows = await tenantDb(org.ctx).auditLog.findMany({
      where: { entity: "Plant", entityId: plant.id },
      orderBy: { at: "asc" },
    });
    expect(rows.map((r) => r.action)).toEqual(["CREATE", "UPDATE", "ARCHIVE", "RESTORE"]);
    const update = rows[1];
    expect((update.before as { name: string }).name).toBe("Audit Org AU1");
    expect((update.after as { name: string }).name).toBe("Renamed");
  });

  it("audits every row of a bulk update and createMany", async () => {
    const org = await makeOrg("Bulk Org", ["BK1"]);
    await withTenantTx(org.ctx, (tx) =>
      tx.department.createMany({
        data: ["A", "B", "C"].map((name) => ({ organizationId: org.organizationId, plantId: org.plants[0].id, name })),
      }),
    );
    await withTenantTx(org.ctx, (tx) => tx.department.updateMany({ data: { archivedAt: new Date() } }));
    const db = tenantDb(org.ctx);
    expect(await db.auditLog.count({ where: { entity: "Department", action: "CREATE" } })).toBe(3);
    expect(await db.auditLog.count({ where: { entity: "Department", action: "ARCHIVE" } })).toBe(3);
  });

  it("never stores password hashes", async () => {
    const org = await makeOrg("Redact Org");
    const user = await withTenantTx(org.ctx, (tx) =>
      tx.user.create({ data: { email: "redact@test.local", passwordHash: "secret-hash" } }),
    );
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entity: "User", entityId: user.id } });
    expect(JSON.stringify(row.after)).not.toContain("secret-hash");
  });

  it("is append-only at the database level", async () => {
    const org = await makeOrg("Immutable Org");
    const row = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.organizationId } });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: "UPDATE" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });

  it("rolls back the audit row with the failed transaction", async () => {
    const org = await makeOrg("Rollback Org", ["RB1"]);
    const before = await prisma.auditLog.count({ where: { organizationId: org.organizationId } });
    await expect(
      withTenantTx(org.ctx, async (tx) => {
        await tx.department.create({ data: { organizationId: org.organizationId, plantId: org.plants[0].id, name: "X" } });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await prisma.auditLog.count({ where: { organizationId: org.organizationId } })).toBe(before);
  });
});
