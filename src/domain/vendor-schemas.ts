import { z } from "zod";
import { dateInput } from "./instrument-schemas";
import { gstinPan, gstinStateCode } from "./india/gstin";
import { isValidGstStateCode } from "./india/gstin";
import { gstinField, panField } from "./schemas";

const optText = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Name").max(100),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Valid email")]).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(\d{10,13})?$/, "10–13 digits incl. country code")
    .optional(),
  isPrimary: z.boolean().default(false),
});

export const ACCREDITATION_TYPES = ["NABL", "OEM", "OTHER"] as const;

export const vendorSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the lab's name").max(150),
    gstin: gstinField,
    pan: panField,
    address: optText(500),
    stateCode: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional()
      .refine((v) => v == null || isValidGstStateCode(v), "Choose a state"),
    contacts: z.array(contactSchema).max(10).default([]),
    accreditationType: z.enum(ACCREDITATION_TYPES),
    nablCertNo: optText(40),
    nablValidUntil: dateInput,
    onsiteCapable: z.boolean().default(false),
    isApproved: z.boolean().default(false),
    evaluationNotes: optText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.accreditationType === "NABL") {
      if (!v.nablCertNo) ctx.addIssue({ code: "custom", path: ["nablCertNo"], message: "NABL certificate number is required" });
      if (!v.nablValidUntil) ctx.addIssue({ code: "custom", path: ["nablValidUntil"], message: "Validity date is required" });
    }
    if (v.gstin && v.pan && gstinPan(v.gstin) !== v.pan)
      ctx.addIssue({ code: "custom", path: ["pan"], message: "PAN doesn't match the GSTIN" });
    if (v.gstin && v.stateCode && gstinStateCode(v.gstin) !== v.stateCode) {
      ctx.addIssue({ code: "custom", path: ["stateCode"], message: "State doesn't match the GSTIN" });
    }
  });

export const scopeRowSchema = z
  .object({
    discipline: z.string().trim().min(1, "Discipline").max(60),
    parameter: z.string().trim().min(1, "Parameter").max(120),
    rangeMin: z
      .union([z.string(), z.number()])
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(z.number().finite().nullable()),
    rangeMax: z
      .union([z.string(), z.number()])
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(z.number().finite().nullable()),
    unit: optText(20),
    cmc: optText(200),
  })
  .refine((r) => r.rangeMin == null || r.rangeMax == null || r.rangeMax >= r.rangeMin, {
    path: ["rangeMax"],
    message: "Max ≥ min",
  });

export const rateContractSchema = z
  .object({
    vendorId: z.string().min(1, "Choose a vendor"),
    plantId: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    number: z.string().trim().min(1, "Enter the contract reference").max(60),
    validFrom: dateInput.refine((d) => d != null, "Start date"),
    validTo: dateInput.refine((d) => d != null, "End date"),
    notes: optText(1000),
  })
  .refine((v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom, {
    path: ["validTo"],
    message: "Must be after the start date",
  });

export const rateItemSchema = z.object({
  instrumentTypeId: z.string().min(1),
  rate: z.coerce.number<string | number>().positive("Rate > 0").max(10_000_000),
  gstPercent: z.coerce.number<string | number>().min(0).max(28),
  onsiteRate: z
    .union([z.string(), z.number()])
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().positive().nullable())
    .nullable()
    .optional(),
  tatDays: z.coerce.number<string | number>().int().min(1).max(180),
});

export type VendorInput = z.input<typeof vendorSchema>;
export type Contact = z.output<typeof contactSchema>;
