"use server";

import { redirect } from "next/navigation";
import { setupSchema } from "@/domain/schemas";
import { toActionError, type ActionResult } from "@/server/action";
import { getAppContext, getSessionUser } from "@/server/context";
import { clientIp } from "@/server/request";
import { createOrganizationForUser } from "@/server/services/setup";
import type { z } from "zod";

/** First-run only: the signed-in user has no organization yet, so defineAction (which needs one) can't be used. */
export async function completeSetup(raw: z.input<typeof setupSchema>): Promise<ActionResult<null>> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (await getAppContext()) redirect("/dashboard");
  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    await createOrganizationForUser(user.id, parsed.data, await clientIp());
  } catch (err) {
    return toActionError(err);
  }
  redirect("/dashboard");
}
