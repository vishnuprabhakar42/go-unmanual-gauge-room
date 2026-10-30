import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { IMPORT_FIELDS, IMPORT_FIELD_KEYS, type ImportFieldKey } from "@/domain/import/fields";
import type { ColumnMapping } from "@/domain/import/mapping";
import { env } from "@/env";

/**
 * Optional AI suggestion for spreadsheet column mapping (feature flag AI_HEADER_MAPPING).
 * Returns null when disabled, refused or failing — callers always keep the fuzzy-match suggestion,
 * and the user confirms every mapping in the wizard.
 */
const MappingOutput = z.object({
  assignments: z.array(
    z.object({
      columnIndex: z.number().int(),
      field: z.enum(IMPORT_FIELD_KEYS as [ImportFieldKey, ...ImportFieldKey[]]),
      confidence: z.number(),
    }),
  ),
});

export function aiHeaderMappingEnabled(): boolean {
  return env().AI_HEADER_MAPPING;
}

export async function aiSuggestMapping(
  headers: string[],
  sampleRows: (string | number | null)[][],
): Promise<ColumnMapping | null> {
  if (!aiHeaderMappingEnabled()) return null;
  const client = new Anthropic();
  const fieldList = IMPORT_FIELDS.map((f) => `- ${f.key}: ${f.label}`).join("\n");
  const columns = headers
    .map((h, i) => `${i}: "${h}" — samples: ${sampleRows.map((r) => JSON.stringify(r[i] ?? "")).join(", ")}`)
    .join("\n");
  try {
    const response = await client.messages.parse({
      model: env().AI_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(MappingOutput) },
      system:
        "You map columns of an Indian manufacturing plant's gauge/instrument register spreadsheet to target fields. " +
        "Assign each target field to at most one column and each column to at most one field. Leave columns unassigned when unsure. " +
        "confidence is 0–1.",
      messages: [
        { role: "user", content: `Target fields:\n${fieldList}\n\nColumns (index: header — sample values):\n${columns}` },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    const mapping: ColumnMapping = {};
    const used = new Set<number>();
    for (const a of [...response.parsed_output.assignments].sort((x, y) => y.confidence - x.confidence)) {
      if (a.confidence < 0.5 || used.has(a.columnIndex) || mapping[a.field] !== undefined) continue;
      if (a.columnIndex < 0 || a.columnIndex >= headers.length) continue;
      mapping[a.field] = a.columnIndex;
      used.add(a.columnIndex);
    }
    return mapping;
  } catch (err) {
    console.warn("[ai] header mapping failed; using fuzzy match", err instanceof Error ? err.message : err);
    return null;
  }
}
