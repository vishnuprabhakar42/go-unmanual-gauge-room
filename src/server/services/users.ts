import type { z } from "zod";
import type { Role } from "@/generated/prisma/client";
import type { inviteUserSchema } from "@/domain/schemas";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { notify } from "@/server/notify/notifier";
import { hashPassword } from "@/server/passwords";
import { currentTenant, type TenantClient, type TenantTx } from "@/server/tenant";

/**
 * Adds a user to the current org with a role (optionally limited to one plant).
 * Creates the User if needed. A user belongs to one organization only.
 */
export async function inviteUser(
  tx: TenantTx,
  input: z.output<typeof inviteUserSchema> & { password?: string | null },
  inviter: { name: string | null; email: string },
  loginUrl: string,
) {
  const { organizationId } = currentTenant();
  if (input.plantId) await tx.plant.findUniqueOrThrow({ where: { id: input.plantId } }); // scoped check

  // Global lookup is intentional: emails are unique across tenants.
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    include: { memberships: { where: { archivedAt: null } } },
  });
  if (existing?.memberships.some((m) => m.organizationId !== organizationId)) {
    throw new UserError("This email already belongs to another organization.", {
      email: ["Already used by another organization"],
    });
  }
  if (existing?.memberships.some((m) => m.role === input.role && m.plantId === input.plantId)) {
    throw new UserError("This user already has that role.", { role: ["Already assigned"] });
  }

  const user =
    existing ??
    (await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash: input.password ? await hashPassword(input.password) : null,
      },
    }));

  const membership = await tx.membership.create({
    data: { organizationId, userId: user.id, role: input.role as Role, plantId: input.plantId },
  });

  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const to: Parameters<typeof notify>[1]["to"] = [{ channel: "EMAIL", recipient: user.email, userId: user.id }];
  if (user.phone) to.push({ channel: "WHATSAPP", recipient: user.phone, userId: user.id });
  await notify(tx, {
    template: "user.invite",
    payload: { orgName: org.name, inviterName: inviter.name ?? inviter.email, role: input.role, loginUrl },
    to,
  });
  return { userId: user.id, membershipId: membership.id };
}

/** Archives one role assignment; refuses to remove the organization's last admin. */
export async function revokeMembership(tx: TenantTx, membershipId: string) {
  const m = await tx.membership.findUniqueOrThrow({ where: { id: membershipId } });
  if (m.archivedAt) return;
  if (m.role === "ORG_ADMIN") {
    const admins = await tx.membership.count({ where: { role: "ORG_ADMIN", archivedAt: null } });
    if (admins <= 1) throw new UserError("An organization needs at least one Org Admin.");
  }
  await tx.membership.update({ where: { id: m.id }, data: { archivedAt: new Date() } });
}

/** Members of an org (scoped user read; nested memberships filtered to the same org explicitly). */
export async function listMembers(db: Pick<TenantClient, "user">, organizationId: string, opts: { q?: string } = {}) {
  return db.user.findMany({
    where: opts.q
      ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { email: { contains: opts.q, mode: "insensitive" } }] }
      : {},
    include: {
      memberships: {
        where: { organizationId, archivedAt: null },
        include: { plant: { select: { code: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}
