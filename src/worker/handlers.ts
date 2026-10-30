import type { PgBoss } from "pg-boss";
import { QUEUES, type JobPayloads } from "@/server/jobs/queues";
import { toDateInput } from "@/domain/india/format";
import { deliverNotification } from "@/server/notify/notifier";
import { activeOrganizationIds, runOrgDigest } from "@/server/services/digest";
import { generateAuditPack } from "@/server/services/audit-pack";
import { expireEndedContracts } from "@/server/services/rate-contracts";
import { withTenantTx } from "@/server/tenant";

/** Registers all job handlers and recurring schedules. Times are IST. */
export async function registerHandlers(boss: PgBoss) {
  await boss.work<JobPayloads["notification.send"]>(QUEUES.notificationSend, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) await deliverNotification(job.data.notificationId);
  });

  await boss.work(QUEUES.systemHeartbeat, async () => {
    console.info(`[worker] heartbeat ${new Date().toISOString()}`);
  });
  await boss.schedule(QUEUES.systemHeartbeat, "0 * * * *", {}, { tz: "Asia/Kolkata" });

  // 09:00 IST: fan out one digest job per organization (singleton per org per day → no duplicates).
  await boss.work(QUEUES.digestDaily, async () => {
    const date = toDateInput(new Date());
    for (const organizationId of await activeOrganizationIds()) {
      await boss.send(
        QUEUES.digestOrg,
        { organizationId, date },
        { singletonKey: `${organizationId}:${date}`, singletonSeconds: 23 * 3600 },
      );
    }
  });
  await boss.work<JobPayloads["digest.org"]>(QUEUES.digestOrg, async (jobs) => {
    for (const job of jobs) {
      const res = await runOrgDigest(job.data.organizationId);
      console.info(`[worker] digest ${job.data.organizationId} ${job.data.date}`, res);
    }
  });
  await boss.schedule(QUEUES.digestDaily, "0 9 * * *", {}, { tz: "Asia/Kolkata" });

  // 00:15 IST: rate contracts past their end date become EXPIRED (audited per org, system actor).
  await boss.work(QUEUES.contractsExpire, async () => {
    for (const organizationId of await activeOrganizationIds()) {
      const n = await withTenantTx({ organizationId, actorId: null, plantIds: "ALL", ip: null }, (tx) =>
        expireEndedContracts(tx),
      );
      if (n) console.info(`[worker] expired ${n} rate contract(s) in ${organizationId}`);
    }
  });
  await boss.schedule(QUEUES.contractsExpire, "15 0 * * *", {}, { tz: "Asia/Kolkata" });

  // Audit packs: one at a time (CPU/memory heavy); the service marks the pack FAILED on error.
  await boss.work<JobPayloads["auditpack.generate"]>(QUEUES.auditPackGenerate, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const res = await generateAuditPack(job.data.auditPackId, job.data.organizationId);
      console.info(`[worker] audit pack ${job.data.auditPackId}`, res);
    }
  });
}
