/** Shared zod schemas for forms and server actions (client + server safe). */
import { z } from "zod";
import { isValidGstin, normalizeGstin } from "./india/gstin";
import { isValidPan, normalizePan } from "./india/pan";
import { INTERNAL_ROLES } from "./rbac";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const gstinField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : normalizeGstin(v)))
  .nullable()
  .optional()
  .refine((v) => v == null || isValidGstin(v), { message: "Enter a valid 15-character GSTIN" });

export const panField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : normalizePan(v)))
  .nullable()
  .optional()
  .refine((v) => v == null || isValidPan(v), { message: "Enter a valid 10-character PAN" });

export const plantCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,4}$/, "1–4 letters or digits (used in document numbers, e.g. PLT1)");

export const plantSchema = z.object({
  name: z.string().trim().min(2, "Enter the plant name").max(100),
  code: plantCodeField,
  address: optionalText,
  gstin: gstinField,
});

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(150),
  gstin: gstinField,
  pan: panField,
  address: optionalText,
});

export const setupSchema = z.object({
  organization: organizationSchema,
  plant: plantSchema,
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(200),
});

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2, "Enter the name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(INTERNAL_ROLES as unknown as [string, ...string[]]),
  /** "" = all plants */
  plantId: z.string().transform((v) => (v === "" ? null : v)),
  phone: optionalText,
});

export type PlantInput = z.input<typeof plantSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;
export type InviteUserInput = z.input<typeof inviteUserSchema>;
