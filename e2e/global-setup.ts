import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SEEDED_MARKER } from "./worker-marker";
import { config } from "dotenv";

/** Fresh, seeded e2e database before every run. */
export default async function globalSetup() {
  config({ quiet: true });
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/gauge_room_e2e";
  const env = { ...process.env, DATABASE_URL: url, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "e2e test database reset" };
  execSync("pnpm prisma migrate reset --force", { stdio: "inherit", env });
  execSync("pnpm prisma db seed", { stdio: "inherit", env });
  fs.mkdirSync(path.dirname(SEEDED_MARKER), { recursive: true });
  fs.writeFileSync(SEEDED_MARKER, new Date().toISOString()); // lets the e2e worker start (see e2e/worker.ts)
}
