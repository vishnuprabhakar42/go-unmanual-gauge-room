import { UserError } from "@/server/errors";
import { withTenantTx, type TenantTx } from "@/server/tenant";

/**
 * Portal access for lab staff (framework-free so it can be unit/integration tested).
 * A portal user belongs to one or more labs (VendorUser); each lab is linked to one or more customer
 * organizations (VendorLink). Every portal read is limited to these (lab, org) pairs; every write runs
 * in that org's audited tenant transaction with the portal user as the actor.
 */
export type VendorContext = {
  user: { id: string; name: string | null; email: string };
  vendors: { id: string; name: string }[];
  /** (vendorId, organizationId) pairs the user may act on */
  links: { vendorId: string; organizationId: string; orgName: string }[];
  ip: string | null;
};

/** Prisma filter for rows carrying vendorId + organizationId (RFQ invites, quotes, POs, challans, jobs). */
export function vendorScope(ctx: VendorContext): { OR: { vendorId: string; organizationId: string }[] } {
  // An empty OR matches nothing — exactly right for a user whose labs have no active customer links.
  return { OR: ctx.links.map((l) => ({ vendorId: l.vendorId, organizationId: l.organizationId })) };
}

/** Runs `fn` as the portal user inside the customer org's audited tenant transaction. */
export function withVendorTx<T>(ctx: VendorContext, organizationId: string, fn: (tx: TenantTx) => Promise<T>) {
  if (!ctx.links.some((l) => l.organizationId === organizationId)) throw new UserError("Not available to this lab");
  return withTenantTx({ organizationId, actorId: ctx.user.id, plantIds: "ALL", ip: ctx.ip }, fn);
}
