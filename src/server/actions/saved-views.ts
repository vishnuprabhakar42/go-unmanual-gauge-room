"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/action";
import { UserError } from "@/server/errors";

export const saveViewAction = defineAction(
  {
    permission: "instrument.view",
    input: z.object({
      page: z.string().min(1).max(50),
      name: z.string().trim().min(1, "Name the view").max(60),
      query: z.string().max(2000),
      shared: z.boolean(),
      path: z.string().startsWith("/"),
    }),
  },
  async ({ path, ...input }, { tx, app }) => {
    const view = await tx.savedView.create({ data: { ...input, organizationId: app.org.id, userId: app.user.id } });
    revalidatePath(path);
    return { id: view.id };
  },
);

export const removeViewAction = defineAction(
  { permission: "instrument.view", input: z.object({ id: z.string().min(1), path: z.string().startsWith("/") }) },
  async ({ id, path }, { tx, app }) => {
    const view = await tx.savedView.findUniqueOrThrow({ where: { id } });
    if (view.userId !== app.user.id && !app.can("org.manage")) throw new UserError("Only the owner can remove this view");
    await tx.savedView.update({ where: { id }, data: { archivedAt: new Date() } });
    revalidatePath(path);
    return null;
  },
);
