/** Job queue names and payloads. Register handlers in src/worker/handlers.ts. */
export const QUEUES = {
  notificationSend: "notification.send",
  systemHeartbeat: "system.heartbeat",
  digestDaily: "digest.daily",
  digestOrg: "digest.org",
  contractsExpire: "contracts.expire",
  auditPackGenerate: "auditpack.generate",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type JobPayloads = {
  "notification.send": { notificationId: string };
  "system.heartbeat": Record<string, never>;
  "digest.daily": Record<string, never>;
  "digest.org": { organizationId: string; date: string };
  "contracts.expire": Record<string, never>;
  "auditpack.generate": { auditPackId: string; organizationId: string };
};
