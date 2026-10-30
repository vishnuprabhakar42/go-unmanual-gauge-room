/**
 * Role-based access control. Every server action declares one Permission; `can()` decides using
 * the user's memberships, which may be org-wide (plantId null) or limited to a plant.
 */
export const ROLES = ["ORG_ADMIN", "QUALITY_HEAD", "GAUGE_INCHARGE", "PURCHASE", "STORES", "OPERATOR", "VENDOR_USER"] as const;
export type Role = (typeof ROLES)[number];

/** Roles assignable to internal (plant) users from Settings → Users. */
export const INTERNAL_ROLES = ROLES.filter((r) => r !== "VENDOR_USER");

export const PERMISSIONS = [
  "org.manage",
  "plant.manage",
  "user.manage",
  "audit.view",
  "dashboard.view",
  "instrument.view",
  "instrument.manage",
  "masters.manage",
  "calibration.request",
  "calibration.approve",
  "quote.techApprove",
  "certificate.verify",
  "oot.decide",
  "auditpack.generate",
  "vendor.view",
  "vendor.manage",
  "rateContract.manage",
  "rfq.manage",
  "po.manage",
  "po.approve",
  "dispatch.manage",
  "receipt.manage",
  "report.view",
  "vendorPortal.access",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL_INTERNAL: readonly Permission[] = PERMISSIONS.filter((p) => p !== "vendorPortal.access");

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  ORG_ADMIN: ALL_INTERNAL,
  QUALITY_HEAD: [
    "audit.view",
    "dashboard.view",
    "instrument.view",
    "instrument.manage",
    "masters.manage",
    "calibration.request",
    "calibration.approve",
    "quote.techApprove",
    "certificate.verify",
    "oot.decide",
    "auditpack.generate",
    "vendor.view",
    "vendor.manage",
    "report.view",
  ],
  GAUGE_INCHARGE: [
    "dashboard.view",
    "instrument.view",
    "instrument.manage",
    "masters.manage",
    "calibration.request",
    "quote.techApprove",
    "certificate.verify",
    "vendor.view",
    "dispatch.manage",
    "receipt.manage",
    "report.view",
  ],
  PURCHASE: [
    "dashboard.view",
    "instrument.view",
    "vendor.view",
    "vendor.manage",
    "rateContract.manage",
    "rfq.manage",
    "po.manage",
    "po.approve",
    "report.view",
  ],
  STORES: ["dashboard.view", "instrument.view", "vendor.view", "dispatch.manage", "receipt.manage"],
  OPERATOR: ["dashboard.view", "instrument.view"],
  VENDOR_USER: ["vendorPortal.access"],
};

export type MembershipGrant = { role: Role; plantId: string | null };

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Does any membership grant `permission`?
 * - plantId undefined: permission anywhere in the org (e.g. org-level screens).
 * - plantId given: only org-wide memberships or memberships for that plant count.
 */
export function can(grants: readonly MembershipGrant[], permission: Permission, plantId?: string): boolean {
  return grants.some(
    (g) => roleHas(g.role, permission) && (plantId === undefined || g.plantId === null || g.plantId === plantId),
  );
}

/** Plant ids the user may see, or "ALL" when any membership is org-wide. */
export function accessiblePlants(grants: readonly MembershipGrant[]): "ALL" | string[] {
  if (grants.some((g) => g.plantId === null)) return "ALL";
  return [...new Set(grants.map((g) => g.plantId).filter((p): p is string => p !== null))];
}

export class ForbiddenError extends Error {
  constructor(public readonly permission?: Permission) {
    super(permission ? `You do not have permission: ${permission}` : "Forbidden");
    this.name = "ForbiddenError";
  }
}

export function assertCan(grants: readonly MembershipGrant[], permission: Permission, plantId?: string): void {
  if (!can(grants, permission, plantId)) throw new ForbiddenError(permission);
}
