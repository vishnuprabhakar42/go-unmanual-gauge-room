import { z } from "zod";

/** Organization.settings JSON. Every field has a default so older rows stay valid. */
export const orgSettingsSchema = z.object({
  /** "Due soon" window when the instrument type has no lead time */
  dueSoonDays: z.number().int().min(1).max(365).default(30),
  /** Calibration requests need quality head approval (else auto-approved on submit) */
  requireRequestApproval: z.boolean().default(true),
  /** Number of challan copies printed (Original / Duplicate / Triplicate) */
  challanCopies: z.number().int().min(1).max(3).default(3),
  timezone: z.literal("Asia/Kolkata").default("Asia/Kolkata"),
  /** SAC printed on calibration POs (998346 = technical testing & analysis services); editable */
  calibrationSac: z
    .string()
    .regex(/^\d{4,8}$/)
    .default("998346"),
  /** Days a vendor has to quote on a spot RFQ by default */
  rfqResponseDays: z.number().int().min(1).max(60).default(5),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export function parseOrgSettings(raw: unknown): OrgSettings {
  const res = orgSettingsSchema.safeParse(raw ?? {});
  return res.success ? res.data : orgSettingsSchema.parse({});
}
