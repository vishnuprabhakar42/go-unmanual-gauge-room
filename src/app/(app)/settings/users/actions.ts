"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/server/passwords";
import { inviteUserSchema } from "@/domain/schemas";
import { defineAction } from "@/server/action";
import { inviteUser, revokeMembership } from "@/server/services/users";

const inviteInput = inviteUserSchema.extend({
  password: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || v.length >= MIN_PASSWORD_LENGTH, { message: `At least ${MIN_PASSWORD_LENGTH} characters` }),
});

export const inviteUserAction = defineAction({ permission: "user.manage", input: inviteInput }, async (input, { tx, app }) => {
  const result = await inviteUser(tx, input, app.user, `${process.env.APP_URL ?? "http://localhost:3000"}/login`);
  revalidatePath("/settings/users");
  return result;
});

export const revokeMembershipAction = defineAction(
  { permission: "user.manage", input: z.object({ membershipId: z.string().min(1) }) },
  async ({ membershipId }, { tx }) => {
    await revokeMembership(tx, membershipId);
    revalidatePath("/settings/users");
    return null;
  },
);
