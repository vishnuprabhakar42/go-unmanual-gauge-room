import { describe, expect, it } from "vitest";
import { ForbiddenError, ROLES, ROLE_PERMISSIONS, accessiblePlants, assertCan, can } from "./rbac";

describe("RBAC", () => {
  it("org admin can manage users anywhere", () => {
    expect(can([{ role: "ORG_ADMIN", plantId: null }], "user.manage")).toBe(true);
    expect(can([{ role: "ORG_ADMIN", plantId: null }], "po.approve", "p2")).toBe(true);
  });

  it("plant-scoped membership only applies to its plant", () => {
    const grants = [{ role: "GAUGE_INCHARGE" as const, plantId: "p1" }];
    expect(can(grants, "instrument.manage", "p1")).toBe(true);
    expect(can(grants, "instrument.manage", "p2")).toBe(false);
    expect(can(grants, "instrument.manage")).toBe(true);
  });

  it("separates duties", () => {
    expect(can([{ role: "GAUGE_INCHARGE", plantId: null }], "po.approve")).toBe(false);
    expect(can([{ role: "PURCHASE", plantId: null }], "certificate.verify")).toBe(false);
    expect(can([{ role: "STORES", plantId: null }], "dispatch.manage")).toBe(true);
    expect(can([{ role: "OPERATOR", plantId: null }], "instrument.manage")).toBe(false);
    expect(can([{ role: "QUALITY_HEAD", plantId: null }], "oot.decide")).toBe(true);
  });

  it("vendor users only get the vendor portal", () => {
    expect(ROLE_PERMISSIONS.VENDOR_USER).toEqual(["vendorPortal.access"]);
    expect(can([{ role: "ORG_ADMIN", plantId: null }], "vendorPortal.access")).toBe(false);
  });

  it("every role has at least one permission", () => {
    for (const r of ROLES) expect(ROLE_PERMISSIONS[r].length).toBeGreaterThan(0);
  });

  it("computes accessible plants", () => {
    expect(
      accessiblePlants([
        { role: "STORES", plantId: "p1" },
        { role: "OPERATOR", plantId: "p2" },
      ]),
    ).toEqual(["p1", "p2"]);
    expect(
      accessiblePlants([
        { role: "STORES", plantId: "p1" },
        { role: "QUALITY_HEAD", plantId: null },
      ]),
    ).toBe("ALL");
    expect(accessiblePlants([])).toEqual([]);
  });

  it("assertCan throws ForbiddenError", () => {
    expect(() => assertCan([], "org.manage")).toThrow(ForbiddenError);
  });
});
