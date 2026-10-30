import "dotenv/config";
import { PgBoss } from "pg-boss";
import { bossConfig, ensureQueues } from "@/server/jobs/boss";
import { registerHandlers } from "./handlers";

async function main() {
  process.env.TZ ??= "Asia/Kolkata";
  const boss = new PgBoss(bossConfig("worker"));
  boss.on("error", (err) => console.error("[worker] pg-boss error", err));
  await boss.start();
  await ensureQueues(boss);
  await registerHandlers(boss);
  console.info("[worker] started");

  const shutdown = async () => {
    console.info("[worker] stopping…");
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
