/** zod schemas for instrument masters (shared by forms and server actions). */
import { z } from "zod";

const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** Empty string → null; otherwise a finite number. */
const optNumber = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    if (typeof v === "number") return v;
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Enter a number" });
      return z.NEVER;
    }
    return n;
  })
  .nullable()
  .optional();

/** "YYYY-MM-DD" from <input type="date"> → Date at midnight IST, or null. */
export const dateInput = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - 330 * 60_000);
  })
  .nullable()
  .optional();

export const CATEGORIES = [
  "DIMENSIONAL",
  "PRESSURE",
  "THERMAL",
  "ELECTRICAL",
  "MASS",
  "TORQUE",
  "FORCE",
  "FLOW",
  "OTHER",
] as const;
export const FREQUENCY_UNITS = ["DAYS", "MONTHS"] as const;
export const CRITICALITIES = ["A", "B", "C"] as const;
export const CAL_SOURCES = ["EXTERNAL", "INHOUSE"] as const;

const frequencyValue = z.coerce
  .number<string | number>()
  .int("Whole number")
  .min(1, "At least 1")
  .max(120 * 31);

export const instrumentTypeSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  category: z.enum(CATEGORIES),
  parameter: optText(60),
  unit: optText(20),
  defaultFrequencyValue: frequencyValue,
  defaultFrequencyUnit: z.enum(FREQUENCY_UNITS),
  defaultTolerance: optText(60),
  nablRequired: z.boolean(),
  hsnCode: z
    .string()
    .trim()
    .regex(/^(\d{4}|\d{6}|\d{8})?$/, "HSN/SAC is 4, 6 or 8 digits")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  defaultLeadTimeDays: z
    .union([z.string(), z.number()])
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(1).max(365).nullable())
    .nullable()
    .optional(),
  standardCode: optText(80),
  standardDate: dateInput,
});

export const ADJUSTABILITY = ["ADJUSTABLE", "NON_ADJUSTABLE"] as const;

export const instrumentSchema = z
  .object({
    plantId: z.string().min(1, "Choose a plant"),
    code: z.string().trim().min(1, "Enter the instrument code").max(50),
    typeId: z.string().min(1, "Choose a type"),
    description: optText(300),
    make: optText(),
    model: optText(),
    serialNo: optText(),
    rangeMin: optNumber,
    rangeMax: optNumber,
    unit: optText(20),
    leastCount: optNumber,
    tolerancePlus: optNumber,
    toleranceMinus: optNumber,
    acceptanceCriteria: optText(1000),
    departmentId: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    locationId: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    custodianName: optText(),
    criticality: z.enum(CRITICALITIES),
    calibrationSource: z.enum(CAL_SOURCES),
    frequencyValue,
    frequencyUnit: z.enum(FREQUENCY_UNITS),
    lastCalibratedAt: dateInput,
    nextDueAt: dateInput,
    nablRequired: z.boolean(),
    purchaseValue: optNumber,
    notes: optText(2000),
    /** Override of "plan N days before due" (admin only); empty = type/org default */
    planLeadDays: z
      .union([z.string(), z.number()])
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(z.number().int("Whole number").min(0, "0 or more").max(365, "At most 365").nullable())
      .nullable()
      .optional(),
    /** Empty = inherit the type's standard */
    standardCode: optText(80),
    standardDate: dateInput,
    adjustable: z
      .enum(["", ...ADJUSTABILITY])
      .transform((v) => (v === "" ? null : v === "ADJUSTABLE"))
      .nullable()
      .optional(),
  })
  .refine((v) => v.rangeMin == null || v.rangeMax == null || v.rangeMax >= v.rangeMin, {
    path: ["rangeMax"],
    message: "Max must be ≥ min",
  });

export const masterNodeSchema = z.object({
  plantId: z.string().min(1, "Choose a plant"),
  name: z.string().trim().min(1, "Enter a name").max(100),
  parentId: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

export type InstrumentInput = z.input<typeof instrumentSchema>;
export type InstrumentTypeInput = z.input<typeof instrumentTypeSchema>;
