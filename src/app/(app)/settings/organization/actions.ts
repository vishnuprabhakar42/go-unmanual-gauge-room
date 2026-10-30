"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { organizationSchema } from "@/domain/schemas";
import { orgSettingsSchema, parseOrgSettings } from "@/domain/settings";
import { defineAction } from "@/server/action";

const input = z.object({
  organization: organizationSchema,
  settings: orgSettingsSchema.pick({ dueSoonDays: true, requireRequestApproval: true, challanCopies: true }),
});

export const updateOrganization = defineAction(
  { permission: "org.manage", input },
  async ({ organization, settings }, { tx, app }) => {
    const current = await tx.organization.findUniqueOrThrow({ where: { id: app.org.id } });
    await tx.organization.update({
      where: { id: app.org.id },
      data: { ...organization, settings: { ...parseOrgSettings(current.settings), ...settings } },
    });
    revalidatePath("/", "layout");
    return null;
  },
);
