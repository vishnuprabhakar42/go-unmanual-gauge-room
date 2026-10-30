import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Go Unmanual <no-reply@gounmanual.local>"),
  WHATSAPP_PROVIDER: z.enum(["console", "meta"]).default("console"),
  META_WHATSAPP_TOKEN: z.string().optional().default(""),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  META_WHATSAPP_API_VERSION: z.string().default("v21.0"),
  AI_CERT_EXTRACTION: bool,
  AI_HEADER_MAPPING: bool,
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().default("claude-opus-5-5"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Server-only environment, validated on first use. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

/** For tests that flip feature flags. */
export function resetEnvCache() {
  cached = undefined;
}
