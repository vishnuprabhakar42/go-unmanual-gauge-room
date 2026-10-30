"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateInput } from "@/domain/instrument-schemas";
import { defineAction } from "@/server/action";
import { UserError } from "@/server/errors";
import { requestAuditPack, retryAuditPack } from "@/server/services/audit-pack";

export const requestAuditPackAction = defineAction(
  {
    permission: "auditpack.generate",
    input: z.object({ plantId: z.string().min(1), from: dateInput, to: dateInput }),
    plantId: (i) => i.plantId,
  },
  async ({ plantId, from, to }, { tx }) => {
    if (!from || !to) throw new UserError("Choose the period");
    const pack = await requestAuditPack(tx, { plantId, from, to });
    revalidatePath("/reports");
    return { id: pack.id };
  },
);

export const retryAuditPackAction = defineAction(
  { permission: "auditpack.generate", input: z.object({ id: z.string().min(1) }) },
  async ({ id }, { tx }) => {
    await retryAuditPack(tx, id);
    revalidatePath("/reports");
  },
);
