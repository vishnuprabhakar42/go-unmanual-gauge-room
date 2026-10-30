import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Extraction } from "@/domain/cert-extraction";
import { env } from "@/env";

/**
 * Optional AI reading of a calibration certificate PDF (feature flag AI_CERT_EXTRACTION).
 * The output only prefills the verification form; the verifier edits and decides. Returns null
 * when disabled, refused or failing — the manual flow is always available.
 */
const ConfidenceKeys = [
  "certificateNo",
  "ulrNo",
  "calibrationDate",
  "accreditationNo",
  "nablMarkPresent",
  "instrumentSerial",
  "readings",
] as const;

export const CertExtractionSchema = z.object({
  certificateNo: z.string().nullable(),
  ulrNo: z.string().nullable(),
  calibrationDate: z.string().nullable().describe("YYYY-MM-DD"),
  nextDueDate: z.string().nullable().describe("YYYY-MM-DD"),
  labName: z.string().nullable(),
  accreditationNo: z.string().nullable().describe("Lab accreditation / NABL certificate number, e.g. CC-2345"),
  nablMarkPresent: z.boolean().nullable(),
  instrumentSerial: z.string().nullable(),
  readings: z.array(
    z.object({
      pointLabel: z.string().nullable(),
      nominal: z.number(),
      asFound: z.number().nullable(),
      asLeft: z.number().describe("Reading after calibration/adjustment (the reported reading if only one)"),
      permissibleError: z.number().nullable(),
      uncertainty: z.number().nullable(),
    }),
  ),
  confidence: z.object(
    Object.fromEntries(ConfidenceKeys.map((k) => [k, z.number().describe("0–1")])) as Record<
      (typeof ConfidenceKeys)[number],
      z.ZodNumber
    >,
  ),
});

export type CertExtractor = (pdf: Buffer) => Promise<Extraction | null>;

export function aiCertExtractionEnabled(): boolean {
  return env().AI_CERT_EXTRACTION;
}

export const anthropicCertExtractor: CertExtractor = async (pdf) => {
  const client = new Anthropic();
  try {
    const response = await client.messages
      .stream({
        model: env().AI_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: zodOutputFormat(CertExtractionSchema) },
        system:
          "You read calibration certificates issued by Indian calibration laboratories (NABL / ISO/IEC 17025) and transcribe their data. " +
          "Transcribe exactly what is printed; use null for anything not on the certificate — never guess or compute values. " +
          "Readings: one entry per calibration point, in the certificate's units; asFound is the before-adjustment reading if reported. " +
          "permissibleError is the stated permissible error / tolerance at that point if printed. " +
          "nablMarkPresent: whether the NABL accreditation symbol or ULR number is shown. " +
          "confidence: 0–1 per field, how sure you are the transcription is correct (low when blurry, handwritten or ambiguous).",
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
              { type: "text", text: "Extract the certificate data." },
            ],
          },
        ],
      })
      .finalMessage();
    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const parsed = CertExtractionSchema.safeParse(JSON.parse(text.text));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.warn("[ai] certificate extraction failed; manual entry", err instanceof Error ? err.message : err);
    return null;
  }
};

let extractor: CertExtractor = anthropicCertExtractor;
export const certExtractor = () => extractor;
/** For tests. */
export function setCertExtractor(e: CertExtractor | undefined) {
  extractor = e ?? anthropicCertExtractor;
}
