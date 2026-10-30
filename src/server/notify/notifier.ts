import type { NotificationChannel } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { enqueue } from "@/server/jobs/boss";
import { currentTenant, type TenantTx } from "@/server/tenant";
import { buildAttachments } from "./attachments";
import { emailProvider } from "./email";
import { isTemplateKey, renderTemplate, type TemplateKey, type TemplatePayload } from "./templates";
import { whatsAppProvider } from "./whatsapp";

export type NotifyInput<K extends TemplateKey> = {
  template: K;
  payload: TemplatePayload<K>;
  /** One entry per channel; recipients are email addresses or E.164 phone numbers */
  to: { channel: NotificationChannel; recipient: string; userId?: string | null }[];
};

/**
 * Notifier: records a Notification row per recipient/channel and queues delivery via pg-boss,
 * inside the caller's transaction. The worker calls `deliverNotification`.
 */
export async function notify<K extends TemplateKey>(tx: TenantTx, input: NotifyInput<K>): Promise<string[]> {
  const rendered = renderTemplate(input.template, input.payload);
  const ids: string[] = [];
  for (const target of input.to) {
    const supported = target.channel === "EMAIL" ? !!rendered.email : !!rendered.whatsapp;
    const n = await tx.notification.create({
      data: {
        organizationId: currentTenant().organizationId,
        userId: target.userId ?? null,
        channel: target.channel,
        template: input.template,
        recipient: target.recipient,
        payload: input.payload as object,
        status: supported ? "QUEUED" : "SKIPPED",
        error: supported ? null : `Template has no ${target.channel} variant`,
      },
    });
    if (supported) await enqueue("notification.send", { notificationId: n.id }, { tx });
    ids.push(n.id);
  }
  return ids;
}

/** Worker-side delivery (system context: notification id is the capability). */
export async function deliverNotification(notificationId: string): Promise<void> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.status !== "QUEUED") return;
  if (!isTemplateKey(n.template)) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "FAILED", error: "Unknown template" } });
    return;
  }
  const rendered = renderTemplate(n.template, n.payload);
  try {
    if (n.channel === "EMAIL" && rendered.email) {
      const attachments = await buildAttachments(n.template, n.payload, n.organizationId);
      await emailProvider().send({ to: n.recipient, ...rendered.email, attachments });
    } else if (n.channel === "WHATSAPP" && rendered.whatsapp) {
      await whatsAppProvider().send({ to: n.recipient, ...rendered.whatsapp });
    }
    await prisma.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
  } catch (err) {
    await prisma.notification.update({ where: { id: n.id }, data: { error: (err as Error).message } });
    throw err; // let pg-boss retry
  }
}
