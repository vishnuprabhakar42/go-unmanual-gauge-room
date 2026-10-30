import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Domain code stays strictly typed (see CLAUDE.md).
    files: ["src/domain/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    // Business tables must go through the tenant client; only these files may import the base client.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/domain/**/*.ts"],
    ignores: ["src/app/(auth)/**", "src/app/api/health/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "@/server/db", message: "Use tenantDb()/withTenantTx() from @/server/tenant (multi-tenancy)." }] },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    ".pgdata/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
