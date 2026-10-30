import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { notify } from "@/server/notify/notifier";
import { currentTenant, type TenantTx } from "@/server/tenant";

/**
 * Gives a lab staff member portal access (magic-link sign-in). Portal users are linked to the lab
 * (VendorUser), never to the customer org, and can't also be internal users.
 */
export async function inviteVendorUser(
  tx: TenantTx,
  vendorId: string,
  input: { name: string; email: string },
  portalUrl: string,
) {
  const { organizationId } = currentTenant();
  const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } }); // must be linked to this org
  if (vendor.ownerOrganizationId !== organizationId) throw new UserError("This lab manages its own portal users");
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    include: { memberships: { where: { archivedAt: null } }, vendorUsers: true },
  });
  if (existing?.memberships.length) throw new UserError("This email belongs to an internal user", { email: ["Internal user"] });
  if (existing?.vendorUsers.some((v) => v.vendorId !== vendorId && !v.archivedAt))
    throw new UserError("This email is already a portal user of another lab", { email: ["Other lab"] });
  const user = existing ?? (await tx.user.create({ data: { name: input.name, email: input.email } }));
  const link = existing?.vendorUsers.find((v) => v.vendorId === vendorId);
  if (link && !link.archivedAt) throw new UserError("Already has portal access", { email: ["Already invited"] });
  if (link) await tx.vendorUser.update({ where: { id: link.id }, data: { archivedAt: null } });
  else await tx.vendorUser.create({ data: { vendorId, userId: user.id } });
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  await notify(tx, {
    template: "vendor.invite",
    payload: { vendorName: vendor.name, orgName: org.name, portalUrl },
    to: [{ channel: "EMAIL", recipient: user.email, userId: user.id }],
  });
  return user;
}

export async function revokeVendorUser(tx: TenantTx, vendorUserId: string) {
  const vu = await tx.vendorUser.findUniqueOrThrow({ where: { id: vendorUserId } });
  const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vu.vendorId } });
  if (vendor.ownerOrganizationId !== currentTenant().organizationId) throw new UserError("This lab manages its own portal users");
  await tx.vendorUser.update({ where: { id: vendorUserId }, data: { archivedAt: new Date() } });
}

/** RFQ invitation email to the lab's contacts and portal users. */
export async function notifyRfqInvites(tx: TenantTx, rfqId: string, vendorIds: string[], appUrl: string) {
  if (!vendorIds.length) return;
  const { organizationId } = currentTenant();
  const [rfq, org] = [
    await tx.rfq.findUniqueOrThrow({ where: { id: rfqId } }),
    await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
  ];
  const vendors = await tx.vendor.findMany({
    where: { id: { in: vendorIds } },
    select: {
      id: true,
      name: true,
      contacts: true,
      users: { where: { archivedAt: null }, select: { user: { select: { email: true } } } },
    },
  });
  for (const v of vendors) {
    const emails = new Set<string>([
      ...((v.contacts ?? []) as { email?: string }[]).map((c) => c.email).filter((e): e is string => !!e),
      ...v.users.map((u) => u.user.email),
    ]);
    if (!emails.size) continue;
    await notify(tx, {
      template: "rfq.invited",
      payload: {
        vendorName: v.name,
        orgName: org.name,
        rfqNumber: rfq.number,
        dueAt: rfq.dueAt.toISOString(),
        portalUrl: `${appUrl}/vendor/rfqs/${rfq.id}`,
      },
      to: [...emails].map((e) => ({ channel: "EMAIL" as const, recipient: e })),
    });
  }
}
