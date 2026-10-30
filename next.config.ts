import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // E2E runs its own server against a separate DB; a separate build dir avoids clashing with `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Fully dynamic, per-tenant app: we opt out of Cache Components (see docs/DECISIONS.md).
  cacheComponents: false,
  experimental: {
    authInterrupts: true, // forbidden() / unauthorized()
    // Excel import posts parsed rows back to the server (up to 25k rows)
    serverActions: { bodySizeLimit: "25mb" },
  },
  serverExternalPackages: ["pg-boss", "@react-pdf/renderer", "exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
