import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ quiet: true });
const PORT = 3100;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/gauge_room_e2e";

const WORKER_PORT = 3101;
const SERVER_ENV = {
  DATABASE_URL: E2E_DATABASE_URL,
  NEXT_DIST_DIR: ".next-e2e",
  APP_URL: `http://localhost:${PORT}`,
  SMTP_HOST: "",
  WHATSAPP_PROVIDER: "console",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-123",
  AUTH_TRUST_HOST: "true",
  AUTH_LOGIN_LIMIT: "1000",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      // Production build: deterministic and fast once built (dev-mode compiles race hydration on slow machines).
      command: `pnpm build && pnpm start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      timeout: 600_000,
      reuseExistingServer: false,
      env: SERVER_ENV,
    },
    {
      // pg-boss worker (audit packs, notifications) against the e2e database
      command: "pnpm tsx e2e/worker.ts",
      url: `http://localhost:${WORKER_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...SERVER_ENV, WORKER_HEALTH_PORT: String(WORKER_PORT) },
    },
  ],
});
