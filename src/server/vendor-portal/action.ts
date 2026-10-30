import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/server/action";
import { getVendorContext } from "./context";
import type { VendorContext } from "./scope";

/** Portal server action: vendor session → zod → handler (which must resolve the doc via vendorScope). */
export function defineVendorAction<S extends z.ZodType, R>(
  input: S,
  handler: (input: z.output<S>, ctx: VendorContext) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const ctx = await getVendorContext();
      if (!ctx) return { ok: false, error: "Your session has expired. Please sign in again." };
      const parsed = input.safeParse(raw);
      if (!parsed.success)
        return {
          ok: false,
          error: "Please fix the highlighted fields.",
          fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
        };
      return { ok: true, data: await handler(parsed.data, ctx) };
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof Error && err.message === "Not available to this lab") return { ok: false, error: err.message };
      return toActionError(err);
    }
  };
}
