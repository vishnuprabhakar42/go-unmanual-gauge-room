import "server-only";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { accessiblePlants, can, type MembershipGrant, type Permission } from "@/domain/rbac";
import { prisma } from "@/server/db";
import { clientIp } from "@/server/request";
import type { TenantContext } from "@/server/tenant";

export const PLANT_COOKIE = "gr_plant";

export type AppContext = {
  user: { id: string; name: string | null; email: string };
  org: { id: string; name: string };
  grants: MembershipGrant[];
  /** Plants the user can access (active only) */
  plants: { id: string; name: string; code: string }[];
  /** Plant selected in the switcher; null = all accessible plants */
  currentPlantId: string | null;
  tenant: TenantContext;
  can(permission: Permission, plantId?: string): boolean;
};

/** Signed-in user, or null. */
export const getSessionUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  return user && !user.archivedAt ? user : null;
});

/**
 * Resolves the internal-user context for this request (cached per request).
 * Returns null when signed out or when the user has no organization yet.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, archivedAt: null, role: { not: "VENDOR_USER" }, organization: { archivedAt: null } },
    include: { organization: { select: { id: true, name: true } } },
  });
  if (memberships.length === 0) return null;

  const org = memberships[0].organization;
  const grants: MembershipGrant[] = memberships
    .filter((m) => m.organizationId === org.id)
    .map((m) => ({ role: m.role, plantId: m.plantId }));
  const access = accessiblePlants(grants);
  const plants = await prisma.plant.findMany({
    where: { organizationId: org.id, archivedAt: null, ...(access === "ALL" ? {} : { id: { in: access } }) },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
  });

  const selected = (await cookies()).get(PLANT_COOKIE)?.value;
  let currentPlantId = selected && plants.some((p) => p.id === selected) ? selected : null;
  if (!currentPlantId && access !== "ALL") currentPlantId = plants[0]?.id ?? null;

  const tenant: TenantContext = {
    organizationId: org.id,
    actorId: user.id,
    plantIds: access === "ALL" ? "ALL" : plants.map((p) => p.id),
    ip: await clientIp(),
  };

  return {
    user: { id: user.id, name: user.name, email: user.email },
    org,
    grants,
    plants,
    currentPlantId,
    tenant,
    can: (permission, plantId) => can(grants, permission, plantId),
  };
});

/** For pages: signed-in internal user with an organization, else redirect. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getAppContext();
  if (ctx) return ctx;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (await isPortalUser(user.id)) redirect("/vendor"); // lab staff never see the internal app
  redirect("/setup");
}

/** Lab staff with portal access (and no internal membership). */
export async function isPortalUser(userId: string): Promise<boolean> {
  return (await prisma.vendorUser.count({ where: { userId, archivedAt: null } })) > 0;
}

/** For pages: renders the 403 page when the permission is missing. */
export async function requirePermission(permission: Permission, plantId?: string): Promise<AppContext> {
  const ctx = await requireContext();
  if (!ctx.can(permission, plantId)) forbidden();
  return ctx;
}

/** For pages reachable by several roles (e.g. requests: planners and purchase). */
export async function requireAnyPermission(...permissions: Permission[]): Promise<AppContext> {
  const ctx = await requireContext();
  if (!permissions.some((p) => ctx.can(p))) forbidden();
  return ctx;
}
