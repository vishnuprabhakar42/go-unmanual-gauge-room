import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getBoss } from "@/server/jobs/boss";
import { QUEUES } from "@/server/jobs/queues";
import { emailProvider } from "@/server/notify/email";
import { deliverNotification, notify } from "@/server/notify/notifier";
import { ConsoleEmailProvider } from "@/server/notify/email";
import { withTenantTx } from "@/server/tenant";
import { makeOrg } from "./helpers";

async function jobsFor(notificationId: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM pgboss.job WHERE name = ${QUEUES.notificationSend} AND data->>'notificationId' = ${notificationId}`;
  return rows.length;
}

describe("notifier", () => {
  afterAll(async () => (await getBoss()).stop({ graceful: false }));

  it("records notifications and enqueues delivery in the same transaction", async () => {
    const org = await makeOrg("Notify Org");
    const [emailId, waId] = await withTenantTx(org.ctx, (tx) =>
      notify(tx, {
        template: "system.test",
        payload: { message: "hello" },
        to: [
          { channel: "EMAIL", recipient: "a@test.local" },
          { channel: "WHATSAPP", recipient: "919800000000" },
        ],
      }),
    );
    expect(await jobsFor(emailId)).toBe(1);
    expect(await jobsFor(waId)).toBe(1);

    await deliverNotification(emailId);
    const sent = await prisma.notification.findUniqueOrThrow({ where: { id: emailId } });
    expect(sent.status).toBe("SENT");
    const provider = emailProvider();
    expect(provider).toBeInstanceOf(ConsoleEmailProvider);
    expect((provider as ConsoleEmailProvider).sent.at(-1)?.text).toBe("hello");
  });

  it("enqueues nothing when the transaction rolls back", async () => {
    const org = await makeOrg("Rollback Notify Org");
    let id = "";
    await expect(
      withTenantTx(org.ctx, async (tx) => {
        [id] = await notify(tx, {
          template: "system.test",
          payload: { message: "x" },
          to: [{ channel: "EMAIL", recipient: "b@test.local" }],
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await prisma.notification.count({ where: { id } })).toBe(0);
    expect(await jobsFor(id)).toBe(0);
  });

  it("rejects payloads that do not match the template", async () => {
    const org = await makeOrg("Bad Payload Org");
    await expect(
      withTenantTx(org.ctx, (tx) =>
        notify(tx, {
          template: "user.invite",
          payload: { orgName: "x" } as never,
          to: [{ channel: "EMAIL", recipient: "c@test.local" }],
        }),
      ),
    ).rejects.toThrow();
  });
});
