import path from "node:path";
import { defineConfig } from "vitest/config";
import { config as loadDotenv } from "dotenv";

const env: Record<string, string> = {};
loadDotenv({ processEnv: env, quiet: true });
const testDbUrl = env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/gauge_room_test";
const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
          env: { TZ: "Asia/Kolkata" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          env: { ...env, TZ: "Asia/Kolkata", DATABASE_URL: testDbUrl, SMTP_HOST: "", WHATSAPP_PROVIDER: "console" },
        },
      },
    ],
  },
});
