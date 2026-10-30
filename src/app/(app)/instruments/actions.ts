"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { instrumentSchema } from "@/domain/instrument-schemas";
import { INSTRUMENT_STATUSES } from "@/domain/instrument-status";
import { defineAction } from "@/server/action";
import { UserError } from "@/server/errors";
import { changeInstrumentStatus, createInstrument, setInstrumentArchived, updateInstrument } from "@/server/services/instruments";

const PLANNING_ADMIN_ONLY = "Only an admin can change the planning lead time";

const refresh = (id?: string) => {
  revalidatePath("/instruments");
  if (id) revalidatePath(`/instruments/${id}`);
};

export const createInstrumentAction = defineAction(
  { permission: "instrument.manage", input: instrumentSchema, plantId: (i) => i.plantId },
  async (input, { tx, app }) => {
    if (input.planLeadDays != null && !app.can("org.manage"))
      throw new UserError(PLANNING_ADMIN_ONLY, { planLeadDays: [PLANNING_ADMIN_ONLY] });
    const inst = await createInstrument(tx, input);
    refresh();
    return { id: inst.id };
  },
);

export const updateInstrumentAction = defineAction(
  {
    permission: "instrument.manage",
    input: z.object({ id: z.string().min(1), data: instrumentSchema }),
    plantId: (i) => i.data.plantId,
  },
  async ({ id, data }, { tx, app }) => {
    const before = await tx.instrument.findUniqueOrThrow({ where: { id }, select: { planLeadDays: true } });
    if ((data.planLeadDays ?? null) !== before.planLeadDays && !app.can("org.manage"))
      throw new UserError(PLANNING_ADMIN_ONLY, { planLeadDays: [PLANNING_ADMIN_ONLY] });
    await updateInstrument(tx, id, data);
    refresh(id);
    return { id };
  },
);

export const changeStatusAction = defineAction(
  {
    permission: "instrument.manage",
    input: z.object({ id: z.string().min(1), to: z.enum(INSTRUMENT_STATUSES), reason: z.string().max(500).optional() }),
  },
  async ({ id, to, reason }, { tx }) => {
    await changeInstrumentStatus(tx, id, to, reason);
    refresh(id);
    return null;
  },
);

export const archiveInstrumentAction = defineAction(
  { permission: "instrument.manage", input: z.object({ id: z.string().min(1), archived: z.boolean() }) },
  async ({ id, archived }, { tx }) => {
    await setInstrumentArchived(tx, id, archived);
    refresh(id);
    return null;
  },
);
