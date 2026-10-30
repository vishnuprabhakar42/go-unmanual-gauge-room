import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, assertCan, type Permission } from "@/domain/rbac";
import { getAppContext, type AppContext } from "@/server/context";
import { UserError } from "@/server/errors";
import { TenantViolationError, withTenantTx, type TenantTx } from "@/server/tenant";

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

type ActionConfig<S extends z.ZodType> = {
  /** Required permission (checked against the plant from `plantId`, if any) */
  permission: Permission;
  input: S;
  /** Plant the action targets, for plant-scoped permission checks */
  plantId?: (input: z.output<S>) => string | null | undefined;
};

/**
 * The only way to write a server action that mutates data:
 * authenticate → validate (zod) → authorize (RBAC) → run in an audited tenant transaction.
 *
 *   export const createPlant = defineAction({ permission: "plant.manage", input: schema },
 *     async (input, { tx, app }) => …)
 */
export function defineAction<S extends z.ZodType, R>(
  config: ActionConfig<S>,
  handler: (input: z.output<S>, ctx: { app: AppContext; tx: TenantTx }) => Promise<R>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (raw) => {
    try {
      const app = await getAppContext();
      if (!app) return { ok: false, error: "Your session has expired. Please sign in again." };
      const parsed = config.input.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Please fix the highlighted fields.",
          fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
        };
      }
      const plantId = config.plantId?.(parsed.data) ?? undefined;
      assertCan(app.grants, config.permission, plantId);
      const data = await withTenantTx(app.tenant, (tx) => handler(parsed.data, { app, tx }));
      return { ok: true, data };
    } catch (err) {
      unstable_rethrow(err);
      return toActionError(err);
    }
  };
}

export function toActionError(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> } {
  if (err instanceof UserError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
  if (err instanceof TenantViolationError)
    return { ok: false, error: "That record is not available in your organization or plant." };
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return { ok: false, error: "A record with the same value already exists." };
    if (err.code === "P2025") return { ok: false, error: "Record not found." };
  }
  console.error("[action] unexpected error", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}
