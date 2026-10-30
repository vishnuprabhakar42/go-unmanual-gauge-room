"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cellText } from "@/domain/import/values";
import { detectHeaderRow, suggestMapping, type ColumnMapping } from "@/domain/import/mapping";
import { IMPORT_FIELD_KEYS } from "@/domain/import/fields";
import { validateRows, type ImportRowResult, type ImportSummary, type RawCell } from "@/domain/import/validate";
import { aiHeaderMappingEnabled, aiSuggestMapping } from "@/server/ai/header-mapping";
import { defineAction, toActionError, type ActionResult } from "@/server/action";
import { getAppContext } from "@/server/context";
import { buildImportContext, commitImport } from "@/server/services/instrument-import";
import { MAX_IMPORT_ROWS, parseSpreadsheet } from "@/server/services/spreadsheet";
import { tenantDb } from "@/server/tenant";

export type AnalyzedFile = {
  fileName: string;
  sheetName: string;
  headerRow: number; // 1-based sheet row
  headers: string[];
  rows: RawCell[][];
  firstDataRow: number;
  mapping: ColumnMapping;
  aiAvailable: boolean;
};

const MAX_BYTES = 15 * 1024 * 1024;

/** Step 1: read the upload, find the header row, suggest a mapping. Nothing is saved. */
export async function analyzeFileAction(formData: FormData): Promise<ActionResult<AnalyzedFile>> {
  try {
    const ctx = await getAppContext();
    if (!ctx?.can("instrument.manage")) return { ok: false, error: "You don't have permission to import instruments." };
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
    if (file.size > MAX_BYTES) return { ok: false, error: "File is larger than 15 MB." };

    const sheet = await parseSpreadsheet(await file.arrayBuffer(), file.name);
    const asText = sheet.rows.map((r) => r.map((c) => cellText(c)));
    const h = detectHeaderRow(asText);
    const headers = asText[h] ?? [];
    const rows = sheet.rows.slice(h + 1);
    if (rows.length > MAX_IMPORT_ROWS)
      return { ok: false, error: `Files can have at most ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows.` };
    return {
      ok: true,
      data: {
        fileName: file.name,
        sheetName: sheet.sheetName,
        headerRow: h + 1,
        headers: headers.map((x, i) => x || `Column ${i + 1}`),
        rows,
        firstDataRow: h + 2,
        mapping: suggestMapping(headers).mapping,
        aiAvailable: aiHeaderMappingEnabled(),
      },
    };
  } catch (err) {
    if (err instanceof Error && /Upload an|no data/.test(err.message)) return { ok: false, error: err.message };
    return toActionError(err);
  }
}

const mappingSchema = z.partialRecord(
  z.enum(IMPORT_FIELD_KEYS as [string, ...string[]]),
  z.number().int().min(0).max(500),
) as z.ZodType<ColumnMapping>;
const cell = z.union([z.string(), z.number(), z.null()]);
const importInput = z.object({
  rows: z.array(z.array(cell)).max(MAX_IMPORT_ROWS),
  mapping: mappingSchema,
  firstDataRow: z.number().int().min(1),
  defaultPlantId: z.string().min(1),
  options: z.object({ createMissingTypes: z.boolean(), updateExisting: z.boolean() }),
  fileName: z.string().max(255),
});

/** Optional: AI column suggestion (feature flag). Returns null when unavailable. */
export async function aiMappingAction(input: { headers: string[]; sample: RawCell[][] }): Promise<ColumnMapping | null> {
  const ctx = await getAppContext();
  if (!ctx?.can("instrument.manage")) return null;
  return aiSuggestMapping(
    input.headers.slice(0, 100),
    input.sample.slice(0, 5).map((r) => r.slice(0, 100)),
  );
}

export type DryRun = { summary: ImportSummary; issues: ImportRowResult[] };
const MAX_ISSUES = 5000;

/** Step 3: validate every row against the org's data (no writes). */
export const dryRunAction = defineAction(
  { permission: "instrument.manage", input: importInput, plantId: (i) => i.defaultPlantId },
  async (input, { app }): Promise<DryRun> => {
    const ctx = await buildImportContext(tenantDb(app.tenant), input.defaultPlantId, input.options);
    const { results, summary } = validateRows(input.rows, input.mapping, ctx, input.firstDataRow);
    const issues = results
      .filter((r) => r.errors.length || r.warnings.length)
      .slice(0, MAX_ISSUES)
      .map((r) => ({ row: r.row, code: r.code, action: r.action, errors: r.errors, warnings: r.warnings }));
    return { summary, issues };
  },
);

/** Step 4: write. Re-validates server-side inside one audited transaction. */
export const commitImportAction = defineAction(
  { permission: "instrument.manage", input: importInput, plantId: (i) => i.defaultPlantId },
  async (input, { tx }) => {
    const outcome = await commitImport(tx, input);
    revalidatePath("/instruments");
    return outcome;
  },
);
