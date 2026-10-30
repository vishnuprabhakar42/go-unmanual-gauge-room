import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/server/db";
import { getSessionUser } from "@/server/context";
import { clientIp } from "@/server/request";

import type { VendorContext } from "./scope";

export type { VendorContext } from "./scope";

export const getVendorContext = cache(async (): Promise<VendorContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const vus = await prisma.vendorUser.findMany({
    where: { userId: user.id, archivedAt: null, vendor: { archivedAt: null } },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          links: {
            where: { archivedAt: null, status: "ACTIVE" },
            select: { organizationId: true, organization: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!vus.length) return null;
  return {
    user: { id: user.id, name: user.name, email: user.email },
    vendors: vus.map((v) => ({ id: v.vendor.id, name: v.vendor.name })),
    links: vus.flatMap((v) =>
      v.vendor.links.map((l) => ({ vendorId: v.vendor.id, organizationId: l.organizationId, orgName: l.organization.name })),
    ),
    ip: await clientIp(),
  };
});

export async function requireVendorContext(): Promise<VendorContext> {
  const ctx = await getVendorContext();
  if (ctx) return ctx;
  if (!(await getSessionUser())) redirect("/login?callbackUrl=/vendor");
  redirect("/dashboard");
}
