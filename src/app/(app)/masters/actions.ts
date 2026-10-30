"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { instrumentTypeSchema, masterNodeSchema } from "@/domain/instrument-schemas";
import { defineAction } from "@/server/action";
import {
  createInstrumentType,
  createMasterNode,
  setInstrumentTypeArchived,
  setMasterNodeArchived,
  updateInstrumentType,
  updateMasterNode,
} from "@/server/services/masters";

const kind = z.enum(["department", "location"]);
const done = () => revalidatePath("/masters", "layout");

export const saveTypeAction = defineAction(
  { permission: "masters.manage", input: z.object({ id: z.string().optional(), data: instrumentTypeSchema }) },
  async ({ id, data }, { tx }) => {
    const row = id ? await updateInstrumentType(tx, id, data) : await createInstrumentType(tx, data);
    done();
    return { id: row.id };
  },
);

export const archiveTypeAction = defineAction(
  { permission: "masters.manage", input: z.object({ id: z.string().min(1), archived: z.boolean() }) },
  async ({ id, archived }, { tx }) => {
    await setInstrumentTypeArchived(tx, id, archived);
    done();
    return null;
  },
);

export const saveNodeAction = defineAction(
  {
    permission: "masters.manage",
    input: z.object({ kind, id: z.string().optional(), data: masterNodeSchema }),
    plantId: (i) => i.data.plantId,
  },
  async ({ kind, id, data }, { tx }) => {
    const row = id ? await updateMasterNode(tx, kind, id, data) : await createMasterNode(tx, kind, data);
    done();
    return { id: row.id };
  },
);

export const archiveNodeAction = defineAction(
  { permission: "masters.manage", input: z.object({ kind, id: z.string().min(1), archived: z.boolean() }) },
  async ({ kind, id, archived }, { tx }) => {
    await setMasterNodeArchived(tx, kind, id, archived);
    done();
    return null;
  },
);
