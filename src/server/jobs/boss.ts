import { PgBoss } from "pg-boss";
import type { TenantTx } from "@/server/tenant";
import { QUEUES, type JobPayloads, type QueueName } from "./queues";

/**
 * pg-boss (Postgres-backed jobs). The web app only *sends*; src/worker runs handlers and schedules.
 * Jobs created via `enqueue(name, data, { tx })` are inserted in the caller's transaction,
 * so they only exist if the business write commits.
 */
const globalForBoss = globalThis as unknown as { __boss?: Promise<PgBoss> };

export function bossConfig(role: "sender" | "worker") {
  return {
    connectionString: process.env.DATABASE_URL,
    schema: "pgboss",
    supervise: role === "worker",
    schedule: role === "worker",
  };
}

export async function ensureQueues(boss: PgBoss) {
  for (const name of Object.values(QUEUES)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name, { retryLimit: 3, retryDelay: 30, retryBackoff: true });
  }
}

export function getBoss(): Promise<PgBoss> {
  globalForBoss.__boss ??= (async () => {
    const boss = new PgBoss(bossConfig("sender"));
    boss.on("error", (err) => console.error("[pg-boss]", err));
    await boss.start();
    await ensureQueues(boss);
    return boss;
  })();
  return globalForBoss.__boss;
}

/** Adapts a Prisma transaction to pg-boss's IDatabase so jobs are enqueued transactionally. */
function txDb(tx: TenantTx) {
  return {
    executeSql: async (text: string, values?: unknown[]) => ({
      rows: (await tx.$queryRawUnsafe<unknown[]>(text, ...(values ?? []))) as Record<string, unknown>[],
    }),
  };
}

export async function enqueue<N extends QueueName>(
  name: N,
  data: JobPayloads[N],
  opts: { tx?: TenantTx; startAfter?: Date; singletonKey?: string } = {},
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, data, {
    startAfter: opts.startAfter,
    singletonKey: opts.singletonKey,
    db: opts.tx ? txDb(opts.tx) : undefined,
  });
}

/** Stops the sender instance (scripts and tests that enqueue jobs must call this to exit cleanly). */
export async function stopBoss() {
  const boss = globalForBoss.__boss;
  if (!boss) return;
  globalForBoss.__boss = undefined;
  await (await boss).stop({ graceful: true, timeout: 5000 });
}
