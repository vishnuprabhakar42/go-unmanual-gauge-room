import {
  DEFAULT_RETURN_DAYS,
  DIGEST_LIST_LIMIT,
  DUE_THIS_WEEK_DAYS,
  digestFor,
  digestRecipients,
  isEmptyDigest,
  type DigestInstrument,
} from "@/domain/digest";
import { sequential } from "@/server/sequential";
import { daysSince, daysUntilDue, startOfIstDay } from "@/domain/due";
import { formatDate } from "@/domain/india/format";
import { prisma } from "@/server/db";
import { notify } from "@/server/notify/notifier";
import { withTenantTx } from "@/server/tenant";
import { overdueReturns } from "./challans";

export type DigestRunResult = { recipients: number; sent: number; skippedEmpty: number; skippedAlreadySent: number };

/**
 * Builds and queues the 09:00 digest for one organization (system actor). Idempotent per day:
 * a recipient who already has today's digest notification is skipped.
 */
export async function runOrgDigest(organizationId: string, now = new Date()): Promise<DigestRunResult> {
  const ctx = { organizationId, actorId: null, plantIds: "ALL" as const, ip: null };
  const today = startOfIstDay(now);
  const weekEnd = new Date(today.getTime() + (DUE_THIS_WEEK_DAYS + 1) * 86_400_000);
  const returnCutoff = new Date(today.getTime() - DEFAULT_RETURN_DAYS * 86_400_000);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return withTenantTx(ctx, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
    const members = await tx.membership.findMany({
      where: { archivedAt: null, role: { in: ["GAUGE_INCHARGE", "QUALITY_HEAD", "ORG_ADMIN"] }, user: { archivedAt: null } },
      select: { role: true, plantId: true, user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    const recipients = digestRecipients(
      members.map((m) => ({
        userId: m.user.id,
        name: m.user.name ?? m.user.email,
        email: m.user.email,
        phone: m.user.phone,
        role: m.role,
        plantId: m.plantId,
      })),
    );
    const result: DigestRunResult = { recipients: recipients.length, sent: 0, skippedEmpty: 0, skippedAlreadySent: 0 };
    if (!recipients.length) return result;

    const select = {
      code: true,
      plantId: true,
      nextDueAt: true,
      statusChangedAt: true,
      type: { select: { name: true } },
      plant: { select: { code: true } },
    } as const;
    const live = { archivedAt: null, status: { in: ["IN_STORE" as const, "IN_USE" as const] } };
    const [overdueRows, weekRows, legacyReturnRows] = await sequential([
      tx.instrument.findMany({ where: { ...live, nextDueAt: { lt: today } }, select }),
      tx.instrument.findMany({ where: { ...live, nextDueAt: { gte: today, lt: weekEnd } }, select }),
      // Sent without a challan (before M4 / manual status change): fall back to 30 days at vendor
      tx.instrument.findMany({
        where: {
          archivedAt: null,
          status: "AT_VENDOR",
          statusChangedAt: { lt: returnCutoff },
          challanItems: { none: { returnedAt: null, challan: { dispatchedAt: { not: null } } } },
        },
        select,
      }),
    ]);
    const challanReturns = await overdueReturns(tx, {}, now);
    const toItem = (r: (typeof overdueRows)[number]): DigestInstrument => ({
      code: r.code,
      type: r.type.name,
      plantId: r.plantId,
      plantCode: r.plant.code,
      days: r.nextDueAt ? daysUntilDue(r.nextDueAt, now) : 0,
      atVendorDays: daysSince(r.statusChangedAt, now),
    });
    const returnItems: DigestInstrument[] = [
      ...challanReturns.map((c) => ({
        code: c.instrument.code,
        type: c.instrument.type.name,
        plantId: c.instrument.plantId,
        plantCode: c.instrument.plant.code,
        days: 0,
        atVendorDays: c.challan.dispatchedAt ? daysSince(c.challan.dispatchedAt, now) : 0,
      })),
      ...legacyReturnRows.map(toItem),
    ];
    const data = { overdue: overdueRows.map(toItem), dueThisWeek: weekRows.map(toItem), returnsOverdue: returnItems };

    const alreadySent = new Set(
      (
        await tx.notification.findMany({
          where: { template: "digest.daily", createdAt: { gte: today }, userId: { in: recipients.map((r) => r.userId) } },
          select: { userId: true },
        })
      ).map((n) => n.userId),
    );

    const line = (i: DigestInstrument, kind: "overdue" | "week" | "return") => ({
      code: i.code,
      type: i.type,
      plant: i.plantCode,
      note:
        kind === "overdue"
          ? `${-i.days} days overdue`
          : kind === "week"
            ? i.days === 0
              ? "due today"
              : `due in ${i.days} days`
            : `${i.atVendorDays} days at vendor`,
    });

    for (const r of recipients) {
      if (alreadySent.has(r.userId)) {
        result.skippedAlreadySent++;
        continue;
      }
      const c = digestFor(r, data);
      if (isEmptyDigest(c)) {
        result.skippedEmpty++;
        continue;
      }
      const to: Parameters<typeof notify>[1]["to"] = [{ channel: "EMAIL", recipient: r.email, userId: r.userId }];
      if (r.phone) to.push({ channel: "WHATSAPP", recipient: r.phone, userId: r.userId });
      await notify(tx, {
        template: "digest.daily",
        payload: {
          orgName: org.name,
          date: formatDate(now),
          recipientName: r.name,
          appUrl,
          counts: {
            overdue: c.overdue.length,
            dueThisWeek: c.dueThisWeek.length,
            returnsOverdue: c.returnsOverdue.length,
            escalated: c.escalated.length,
          },
          overdue: c.overdue.slice(0, DIGEST_LIST_LIMIT).map((i) => line(i, "overdue")),
          dueThisWeek: c.dueThisWeek.slice(0, DIGEST_LIST_LIMIT).map((i) => line(i, "week")),
          returnsOverdue: c.returnsOverdue.slice(0, DIGEST_LIST_LIMIT).map((i) => line(i, "return")),
          escalated: c.escalated.slice(0, DIGEST_LIST_LIMIT).map((i) => line(i, "overdue")),
        },
        to,
      });
      result.sent++;
    }
    return result;
  });
}

/** Active organizations (system-level list for the scheduler). */
export async function activeOrganizationIds(): Promise<string[]> {
  return (await prisma.organization.findMany({ where: { archivedAt: null }, select: { id: true } })).map((o) => o.id);
}
