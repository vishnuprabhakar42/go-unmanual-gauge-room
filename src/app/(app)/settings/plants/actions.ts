"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { plantSchema } from "@/domain/schemas";
import { defineAction } from "@/server/action";
import { createPlant, setPlantArchived, updatePlant } from "@/server/services/plants";

const done = () => revalidatePath("/", "layout");

export const createPlantAction = defineAction({ permission: "plant.manage", input: plantSchema }, async (input, { tx }) => {
  const plant = await createPlant(tx, input);
  done();
  return { id: plant.id };
});

export const updatePlantAction = defineAction(
  { permission: "plant.manage", input: plantSchema.extend({ id: z.string().min(1) }), plantId: (i) => i.id },
  async ({ id, ...data }, { tx }) => {
    await updatePlant(tx, id, data);
    done();
    return null;
  },
);

export const setPlantArchivedAction = defineAction(
  { permission: "plant.manage", input: z.object({ id: z.string().min(1), archived: z.boolean() }), plantId: (i) => i.id },
  async ({ id, archived }, { tx }) => {
    await setPlantArchived(tx, id, archived);
    done();
    return null;
  },
);
