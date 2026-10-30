/**
 * Docker-free local Postgres for development and tests.
 * Use docker-compose when Docker is available; this is the fallback (see docs/DECISIONS.md).
 *
 *   pnpm db:start   → runs Postgres on :5432 (data in .pgdata/) until Ctrl+C
 */
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dataDir = path.resolve(process.cwd(), ".pgdata");
const port = Number(process.env.PGPORT ?? 5432);
const databases = ["gauge_room", "gauge_room_test", "gauge_room_e2e"];

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    onLog: () => {},
  });

  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log("Initialising Postgres cluster in .pgdata …");
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  for (const db of databases) {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${db}"`);
      console.log(`Created database ${db}`);
    }
  }
  await client.end();
  console.log(`Postgres ready on postgresql://postgres:postgres@localhost:${port} (Ctrl+C to stop)`);

  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
