import { execSync } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";

/** Migrates the test database and truncates all app tables before the integration run. */
export default async function setup() {
  const env: Record<string, string> = {};
  config({ processEnv: env, quiet: true });
  const url = env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/gauge_room_test";
  execSync("pnpm prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length) await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
  await client.query(`DROP SCHEMA IF EXISTS pgboss CASCADE`);
  await client.end();
}
