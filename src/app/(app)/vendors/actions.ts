"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scopeRowSchema, vendorSchema } from "@/domain/vendor-schemas";
import { defineAction } from "@/server/action";
import { inviteVendorUser, revokeVendorUser } from "@/server/services/vendor-users";
import {
  addScopeRows,
  createVendor,
  parseScopeCsv,
  removeScopeRow,
  setVendorArchived,
  updateVendor,
} from "@/server/services/vendors";

const refresh = (id?: string) => {
  revalidatePath("/vendors");
  if (id) revalidatePath(`/vendors/${id}`);
};

export const createVendorAction = defineAction({ permission: "vendor.manage", input: vendorSchema }, async (input, { tx }) => {
  const v = await createVendor(tx, input);
  refresh();
  return { id: v.id };
});

export const updateVendorAction = defineAction(
  { permission: "vendor.manage", input: z.object({ id: z.string().min(1), data: vendorSchema }) },
  async ({ id, data }, { tx }) => {
    await updateVendor(tx, id, data);
    refresh(id);
    return { id };
  },
);

export const archiveVendorAction = defineAction(
  { permission: "vendor.manage", input: z.object({ id: z.string().min(1), archived: z.boolean() }) },
  async ({ id, archived }, { tx }) => {
    await setVendorArchived(tx, id, archived);
    refresh(id);
    return null;
  },
);

export const addScopeRowAction = defineAction(
  { permission: "vendor.manage", input: z.object({ vendorId: z.string().min(1), row: scopeRowSchema }) },
  async ({ vendorId, row }, { tx }) => {
    await addScopeRows(tx, vendorId, [row]);
    refresh(vendorId);
    return null;
  },
);

export const removeScopeRowAction = defineAction(
  { permission: "vendor.manage", input: z.object({ vendorId: z.string().min(1), scopeId: z.string().min(1) }) },
  async ({ vendorId, scopeId }, { tx }) => {
    await removeScopeRow(tx, scopeId);
    refresh(vendorId);
    return null;
  },
);

export const importScopeCsvAction = defineAction(
  {
    permission: "vendor.manage",
    input: z.object({ vendorId: z.string().min(1), csv: z.string().max(2_000_000), replace: z.boolean() }),
  },
  async ({ vendorId, csv, replace }, { tx }) => {
    const { rows, errors } = parseScopeCsv(csv);
    await addScopeRows(tx, vendorId, rows, replace);
    refresh(vendorId);
    return { imported: rows.length, errors };
  },
);

export const inviteVendorUserAction = defineAction(
  {
    permission: "vendor.manage",
    input: z.object({
      vendorId: z.string().min(1),
      name: z.string().trim().min(2, "Enter the name").max(100),
      email: z.string().trim().toLowerCase().email("Enter a valid email"),
    }),
  },
  async ({ vendorId, name, email }, { tx }) => {
    await inviteVendorUser(tx, vendorId, { name, email }, `${process.env.APP_URL ?? "http://localhost:3000"}/vendor`);
    refresh(vendorId);
    return null;
  },
);

export const revokeVendorUserAction = defineAction(
  { permission: "vendor.manage", input: z.object({ vendorId: z.string().min(1), vendorUserId: z.string().min(1) }) },
  async ({ vendorId, vendorUserId }, { tx }) => {
    await revokeVendorUser(tx, vendorUserId);
    refresh(vendorId);
    return null;
  },
);
