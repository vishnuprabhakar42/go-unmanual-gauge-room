import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Base (unscoped) Prisma client. Application code must NOT query business tables with this
 * directly — use `tenantDb(ctx)` / `withTenantTx(ctx, fn)` from src/server/tenant.
 * Allowed direct uses: auth (User/Account/Session), first-run setup, seeds, workers acting as system.
 */
function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

type BaseClient = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { __prisma?: BaseClient };

export const prisma: BaseClient = globalForPrisma.__prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

export type { BaseClient };
